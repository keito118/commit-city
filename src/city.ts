import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Building, CityLayout } from "./layout";
import type { Theme } from "./themes";

/** Draws a CityLayout. All buildings share one InstancedMesh so big repos stay fast. */
export class CityView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private ambient = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  private sun = new THREE.DirectionalLight(0xffffff, 1);
  private ground: THREE.Mesh;
  private cityGroup = new THREE.Group();
  private buildingMesh: THREE.InstancedMesh | null = null;
  private districtMesh: THREE.InstancedMesh | null = null;
  private highlight: THREE.LineSegments;
  private emissive = { value: 0 };
  private layout: CityLayout | null = null;
  private theme: Theme;

  constructor(private container: HTMLElement, theme: Theme) {
    this.theme = theme;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, 1, 1, 5000);
    this.camera.position.set(320, 260, 320);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.48;

    this.sun.position.set(-200, 400, 150);
    this.scene.add(this.ambient, this.sun, this.cityGroup);

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.05;
    this.scene.add(this.ground);

    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
      new THREE.LineBasicMaterial({ color: 0xffffff }),
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.applyTheme(theme);
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    this.applyTheme(theme);
    if (this.layout) this.show(this.layout, false);
  }

  show(layout: CityLayout, resetCamera = true) {
    this.layout = layout;
    this.clear();
    this.highlight.visible = false;

    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    const districts = new THREE.InstancedMesh(
      box,
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      Math.max(layout.districts.length, 1),
    );
    districts.count = layout.districts.length;
    layout.districts.forEach((d, i) => {
      // Deeper folders sit on slightly raised plates so nesting is visible.
      const plate = 0.25;
      matrix.makeScale(d.width, plate, d.length).setPosition(d.x, (d.depth - 1) * plate, d.z);
      districts.setMatrixAt(i, matrix);
      const palette = this.theme.districts;
      districts.setColorAt(i, color.set(palette[Math.min(d.depth - 1, palette.length - 1)]));
    });

    const buildings = new THREE.InstancedMesh(box, this.buildingMaterial(), Math.max(layout.buildings.length, 1));
    buildings.count = layout.buildings.length;
    layout.buildings.forEach((b, i) => {
      matrix.makeScale(b.width, b.height, b.depth).setPosition(b.x, this.baseOf(b), b.z);
      buildings.setMatrixAt(i, matrix);
      buildings.setColorAt(i, color.set(this.theme.buildings[b.language]));
    });

    this.districtMesh = districts;
    this.buildingMesh = buildings;
    this.cityGroup.add(districts, buildings);

    if (resetCamera) {
      const tallest = layout.buildings.reduce((max, b) => Math.max(max, b.height), 0);
      const r = layout.extent * 0.95;
      this.camera.position.set(r, r * 0.9 + tallest * 0.5, r);
      this.controls.target.set(0, 0, 0);
    }
  }

  /** Returns the building under a screen point, or null. */
  pick(clientX: number, clientY: number): Building | null {
    if (!this.buildingMesh || !this.layout) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);
    const hit = raycaster.intersectObject(this.buildingMesh)[0];
    return hit?.instanceId !== undefined ? this.layout.buildings[hit.instanceId] : null;
  }

  select(building: Building | null) {
    this.highlight.visible = building !== null;
    if (!building) return;
    this.highlight.scale.set(building.width * 1.04, building.height * 1.02, building.depth * 1.04);
    this.highlight.position.set(building.x, this.baseOf(building), building.z);
  }

  snapshot(): string {
    return this.renderer.domElement.toDataURL("image/png");
  }

  private baseOf(b: Building): number {
    const depth = b.path.split("/").length - 1;
    return depth * 0.25;
  }

  private buildingMaterial(): THREE.Material {
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.05 });
    // Lets night themes make buildings glow in their own color.
    material.onBeforeCompile = (shader) => {
      shader.uniforms.selfGlow = this.emissive;
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", "uniform float selfGlow;\nvoid main() {")
        .replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * selfGlow;",
        );
    };
    return material;
  }

  private applyTheme(theme: Theme) {
    this.scene.background = new THREE.Color(theme.sky);
    this.scene.fog = new THREE.Fog(theme.fog, 600, 1800);
    (this.ground.material as THREE.MeshLambertMaterial).color.set(theme.ground);
    this.ambient.intensity = theme.ambient * 2;
    this.sun.intensity = theme.sun;
    this.emissive.value = theme.emissive;
  }

  private clear() {
    for (const mesh of [this.buildingMesh, this.districtMesh]) {
      if (!mesh) continue;
      this.cityGroup.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
    this.buildingMesh = this.districtMesh = null;
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
