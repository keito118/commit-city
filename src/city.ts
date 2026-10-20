import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FLOOR_HEIGHT, PLATE_HEIGHT, type Building, type CityLayout } from "./layout";
import type { BuildingKind } from "./languages";
import type { Theme } from "./themes";

/** How each kind of building is shaped: its window grid and its roof. */
interface KindStyle {
  /** Window grid; null for windowless buildings. */
  windows: { spacing: number; marginU: number; bottom: number; top: number } | null;
  roof: "flat" | "gable" | "flat-with-unit";
  roughness: number;
  metalness: number;
}

const STYLES: Record<BuildingKind, KindStyle> = {
  tower: { windows: { spacing: 2.2, marginU: 0.05, bottom: 0.08, top: 0.92 }, roof: "flat-with-unit", roughness: 0.45, metalness: 0.3 },
  office: { windows: { spacing: 3.0, marginU: 0.2, bottom: 0.3, top: 0.8 }, roof: "flat-with-unit", roughness: 0.85, metalness: 0 },
  house: { windows: { spacing: 4.2, marginU: 0.3, bottom: 0.35, top: 0.75 }, roof: "gable", roughness: 0.9, metalness: 0 },
  warehouse: { windows: null, roof: "flat", roughness: 0.7, metalness: 0.15 },
  hall: { windows: { spacing: 3.6, marginU: 0.28, bottom: 0.15, top: 0.85 }, roof: "flat", roughness: 0.9, metalness: 0 },
  shed: { windows: null, roof: "flat", roughness: 0.9, metalness: 0 },
};

/** Shared by every window shader, so changing the theme needs no recompiling. */
const windowUniforms = {
  cityGlass: { value: new THREE.Color() },
  cityLitA: { value: new THREE.Color() },
  cityLitB: { value: new THREE.Color() },
  cityLitShare: { value: 0 },
  cityGlow: { value: 0 },
};

/** Draws a CityLayout. Each building kind is one InstancedMesh, so big repositories stay fast. */
export class CityView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private ambient = new THREE.HemisphereLight();
  private sun = new THREE.DirectionalLight();
  private grass: THREE.Mesh;
  private asphalt: THREE.Mesh;
  private cityGroup = new THREE.Group();
  private pickables: THREE.InstancedMesh[] = [];
  private highlight: THREE.LineSegments;
  private layout: CityLayout | null = null;
  private theme: Theme;

  constructor(private container: HTMLElement, theme: Theme) {
    this.theme = theme;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 20000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.47;

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.4;
    this.scene.add(this.ambient, this.sun, this.sun.target, this.cityGroup);

    this.grass = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial());
    this.grass.rotation.x = -Math.PI / 2;
    this.grass.position.y = -0.1;
    this.grass.receiveShadow = true;
    this.asphalt = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.95 }));
    this.asphalt.rotation.x = -Math.PI / 2;
    this.asphalt.position.y = -0.02;
    this.asphalt.receiveShadow = true;
    this.scene.add(this.grass, this.asphalt);

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
    const { extent } = layout;

    this.grass.scale.set(extent * 12, extent * 12, 1);
    this.asphalt.scale.set(extent + 16, extent + 16, 1);
    this.fitSun(extent);

    this.addPlates(layout);
    const byKind = new Map<BuildingKind, Building[]>();
    for (const b of layout.buildings) {
      const list = byKind.get(b.kind) ?? [];
      list.push(b);
      byKind.set(b.kind, list);
    }
    for (const [kind, buildings] of byKind) this.addBuildings(kind, buildings, layout.buildings);

    if (resetCamera) {
      const r = extent * 1.15;
      this.camera.position.set(r * 0.75, r * 0.85 + layout.tallest, r);
      this.camera.far = extent * 20;
      this.camera.updateProjectionMatrix();
      this.controls.target.set(0, 0, 0);
      this.controls.maxDistance = extent * 4;
    }
    this.scene.fog = new THREE.Fog(this.theme.sky, extent * 1.4, extent * 5);
  }

  /** Returns the building under a screen point, or null. */
  pick(clientX: number, clientY: number): Building | null {
    if (!this.layout) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);
    const hit = raycaster.intersectObjects(this.pickables, false)[0];
    if (!hit || hit.instanceId === undefined) return null;
    const indices = hit.object.userData.buildingIndex as number[];
    return this.layout.buildings[indices[hit.instanceId]];
  }

  select(building: Building | null) {
    this.highlight.visible = building !== null;
    if (!building) return;
    this.highlight.scale.set(building.width * 1.04, building.height * 1.02, building.depth * 1.04);
    this.highlight.position.set(building.x, building.base, building.z);
  }

  snapshot(): string {
    return this.renderer.domElement.toDataURL("image/png");
  }

  private addPlates(layout: CityLayout) {
    const plates = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.95 }),
      Math.max(layout.districts.length, 1),
    );
    plates.count = layout.districts.length;
    plates.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const palette = this.theme.plates;
    layout.districts.forEach((d, i) => {
      matrix.makeScale(d.width, PLATE_HEIGHT, d.length).setPosition(d.x, (d.depth - 1) * PLATE_HEIGHT, d.z);
      plates.setMatrixAt(i, matrix);
      plates.setColorAt(i, color.set(palette[Math.min(d.depth - 1, palette.length - 1)]));
    });
    this.cityGroup.add(plates);
  }

  private addBuildings(kind: BuildingKind, buildings: Building[], all: Building[]) {
    const style = STYLES[kind];
    const colors = this.theme.kinds[kind];
    const indexOf = new Map(all.map((b, i) => [b, i]));

    // Body: a unit box standing on y = 0, with a per-instance seed for window lighting.
    const bodyGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    bodyGeometry.setAttribute(
      "citySeed",
      new THREE.InstancedBufferAttribute(new Float32Array(buildings.map((b) => (b.seed % 997) / 997)), 1),
    );
    const body = new THREE.InstancedMesh(bodyGeometry, buildingMaterial(style), buildings.length);
    body.castShadow = body.receiveShadow = true;
    body.userData.buildingIndex = buildings.map((b) => indexOf.get(b)!);

    const roofGeometry = style.roof === "gable" ? gableGeometry() : new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const roof = new THREE.InstancedMesh(
      roofGeometry,
      new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: style.roof === "gable" }),
      buildings.length,
    );
    roof.castShadow = roof.receiveShadow = true;

    const withUnit = style.roof === "flat-with-unit";
    const units = withUnit
      ? new THREE.InstancedMesh(
          new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
          new THREE.MeshStandardMaterial({ roughness: 0.7, color: 0x8b8f93 }),
          buildings.length,
        )
      : null;
    if (units) units.castShadow = true;

    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    buildings.forEach((b, i) => {
      matrix.makeScale(b.width, b.height, b.depth).setPosition(b.x, b.base, b.z);
      body.setMatrixAt(i, matrix);
      body.setColorAt(i, color.set(colors.walls[b.seed % colors.walls.length]));

      const top = b.base + b.height;
      if (style.roof === "gable") {
        // Ridge runs along the longer side.
        const alongX = b.width >= b.depth;
        const span = alongX ? b.depth : b.width;
        rotation.setFromAxisAngle(yAxis, alongX ? 0 : Math.PI / 2);
        matrix.compose(
          new THREE.Vector3(b.x, top, b.z),
          rotation,
          new THREE.Vector3((alongX ? b.width : b.depth) * 1.04, Math.min(span * 0.45, FLOOR_HEIGHT * 2), span * 1.08),
        );
      } else {
        matrix.makeScale(b.width * 1.02, 0.5, b.depth * 1.02).setPosition(b.x, top, b.z);
      }
      roof.setMatrixAt(i, matrix);
      roof.setColorAt(i, color.set(colors.roofs[(b.seed >>> 8) % colors.roofs.length]));

      if (units) {
        // A small machine room on the roof, offset a little so rooftops don't all look the same.
        const size = Math.min(b.width, b.depth) * 0.3;
        const dx = (((b.seed >>> 4) % 5) - 2) * 0.1 * b.width;
        const dz = (((b.seed >>> 12) % 5) - 2) * 0.1 * b.depth;
        matrix.makeScale(size, Math.min(size, FLOOR_HEIGHT * 0.8), size).setPosition(b.x + dx, top + 0.5, b.z + dz);
        units.setMatrixAt(i, matrix);
      }
    });

    this.cityGroup.add(body, roof);
    if (units) this.cityGroup.add(units);
    this.pickables.push(body);
  }

  private fitSun(extent: number) {
    const { elevation } = this.theme.sun;
    const distance = extent * 1.5;
    this.sun.position.set(-distance * 0.6, distance * Math.max(elevation, 0.15), distance * 0.45);
    this.sun.target.position.set(0, 0, 0);
    const cam = this.sun.shadow.camera;
    const half = extent * 0.75;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 1;
    cam.far = distance * 4;
    cam.updateProjectionMatrix();
  }

  private applyTheme(theme: Theme) {
    this.scene.background = new THREE.Color(theme.sky);
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.set(theme.sky);
    (this.grass.material as THREE.MeshLambertMaterial).color.set(theme.ground);
    (this.asphalt.material as THREE.MeshStandardMaterial).color.set(theme.road);
    this.ambient.color.set(theme.ambient.sky);
    this.ambient.groundColor.set(theme.ambient.ground);
    this.ambient.intensity = theme.ambient.intensity;
    this.sun.color.set(theme.sun.color);
    this.sun.intensity = theme.sun.intensity;
    this.sun.castShadow = theme.shadows;
    this.renderer.toneMappingExposure = theme.exposure;
    windowUniforms.cityGlass.value.set(theme.windows.glass);
    windowUniforms.cityLitA.value.set(theme.windows.lit[0]);
    windowUniforms.cityLitB.value.set(theme.windows.lit[1]);
    windowUniforms.cityLitShare.value = theme.windows.litShare;
    windowUniforms.cityGlow.value = theme.windows.glow;
    if (this.layout) this.fitSun(this.layout.extent);
  }

  private clear() {
    for (const object of [...this.cityGroup.children]) {
      const mesh = object as THREE.InstancedMesh;
      this.cityGroup.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
    this.pickables = [];
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

/** A unit prism: base 1 x 1 on y = 0, ridge along x at y = 1. */
function gableGeometry(): THREE.BufferGeometry {
  const a = [-0.5, 0, -0.5];
  const b = [0.5, 0, -0.5];
  const c = [0.5, 0, 0.5];
  const d = [-0.5, 0, 0.5];
  const e = [-0.5, 1, 0];
  const f = [0.5, 1, 0];
  const triangles = [
    [a, f, b], [a, e, f], // slope facing -z
    [d, c, f], [d, f, e], // slope facing +z
    [a, d, e], // gable end at -x
    [b, f, c], // gable end at +x
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(triangles.flat(2), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Walls with a window grid drawn in the shader: no textures, and the grid
 * follows each building's real size so windows stay the same size everywhere.
 */
function buildingMaterial(style: KindStyle): THREE.Material {
  const material = new THREE.MeshStandardMaterial({ roughness: style.roughness, metalness: style.metalness });
  const w = style.windows;
  if (!w) return material;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windowUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        `attribute float citySeed;
varying vec3 cityLocal;
varying vec3 citySize;
varying vec3 cityNormal;
varying float citySeedV;
void main() {`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
cityLocal = position;
cityNormal = normal;
citySeedV = citySeed;
citySize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `uniform vec3 cityGlass;
uniform vec3 cityLitA;
uniform vec3 cityLitB;
uniform float cityLitShare;
uniform float cityGlow;
varying vec3 cityLocal;
varying vec3 citySize;
varying vec3 cityNormal;
varying float citySeedV;
float cityHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
void main() {
  float cityWindow = 0.0;
  vec3 cityLight = vec3(0.0);`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
if (abs(cityNormal.y) < 0.5) {
  bool sideX = abs(cityNormal.x) > 0.5;
  float faceWidth = sideX ? citySize.z : citySize.x;
  float u = (sideX ? cityLocal.z : cityLocal.x) + 0.5;
  float columns = max(1.0, floor(faceWidth / ${w.spacing.toFixed(2)}));
  float column = floor(u * columns);
  float cellU = fract(u * columns);
  float y = cityLocal.y * citySize.y / ${FLOOR_HEIGHT.toFixed(2)};
  float storey = floor(y);
  float cellV = fract(y);
  cityWindow = step(${w.marginU.toFixed(2)}, cellU) * step(cellU, ${(1 - w.marginU).toFixed(2)})
    * step(${w.bottom.toFixed(2)}, cellV) * step(cellV, ${w.top.toFixed(2)});
  float face = sideX ? sign(cityNormal.x) : 2.0 * sign(cityNormal.z);
  float h = cityHash(vec3(column + face * 31.0, storey, citySeedV * 997.0));
  vec3 lit = mix(cityLitA, cityLitB, step(0.5, fract(h * 13.7)));
  float isLit = step(h, cityLitShare);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(cityGlass, lit * 0.6, isLit * step(0.01, cityGlow)), cityWindow);
  cityLight = lit * isLit * cityWindow * cityGlow;
}`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.2, cityWindow);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
totalEmissiveRadiance += cityLight;`,
      );
  };
  // Same program for every material of this style, different from plain walls.
  material.customProgramCacheKey = () => `city-windows-${w.spacing}-${w.marginU}-${w.bottom}-${w.top}`;
  return material;
}
