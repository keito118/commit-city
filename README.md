English | [日本語](README.ja.md)

# commit-city

**Turn any GitHub repository into a 3D city and replay its history.**

Paste a repository and its code becomes a city in your browser: folders are districts, files are buildings, files edited often grow into towers, and big files take up more ground. Fly around, click a building, and jump to that file on GitHub.

![express as a city](docs/screenshot.png)

| vitejs/vite | express at dusk |
|---|---|
| ![vite as a city](docs/screenshot-vite.png) | ![express at dusk](docs/screenshot-dusk.png) |

> Status: v0.1. The city shows the repository as it is today. Replaying the commit history is next (see the roadmap).

## How to read the city

| In the city | In the repository |
|---|---|
| District (raised plate) | Folder. Deeper folders sit higher; streets get narrower the deeper you go. |
| Building | File |
| Height | How many commits edited the file (log scale: 1 edit = 3 floors, 10 = 9, 100 = 17, 1000 = 25) |
| Ground | The file's size relative to the whole repository. **Balanced** (default) uses the square root so a few big images or lockfiles don't turn half the city into empty lots; **Exact share** is the plain ratio. |
| Kind of building | Kind of file, see below |
| Color | Real-world paint: each building picks its own wall and roof color from the theme's palette, so the city looks lived in rather than color-coded |

| Building | Files |
|---|---|
| Glass tower | C, C++, Rust, Go, Swift, C#, Java, Kotlin, Scala |
| Office block | JavaScript, TypeScript, Python, HTML/CSS, Ruby, PHP, shell |
| House with a pitched roof | Docs: Markdown, text |
| Warehouse | Data and config: JSON, YAML, TOML, lockfiles, SQL |
| Brick hall | Images, fonts, audio, video |
| Shed | Everything else |

Edit counts follow renames, so a file that moved keeps its history. Districts are laid out with a squarified treemap, windows are drawn in a shader (no textures), and each kind of building is one instanced mesh, so repositories with tens of thousands of files stay smooth.

## Use it

Open the page with a repository in the URL:

```
https://keito118.github.io/commit-city/?repo=vitejs/vite
https://keito118.github.io/commit-city/?repo=mrdoob/three.js&theme=cyberpunk
```

Or type `owner/repo` (or a GitHub URL) into the box. The URL updates as you go, so you can share the exact city you're looking at.

- Drag to orbit, right-drag to pan, scroll to zoom.
- Click a building to see its edits, size, share of the repository and last edit, with a link to the file.
- Pick a look from **Theme**.

### Where the edit counts come from

GitHub's API doesn't say which files a commit changed until you ask for that commit, so heights cost one request per commit:

| Source | History read | Notes |
|---|---|---|
| No token | Latest 25 commits | GitHub allows 60 requests an hour without a token, so heights are only a hint |
| GitHub token (under **GitHub token**) | Latest 400 commits | Also opens your private repositories. Stored only in your browser. A fine-grained token with read-only **Contents** access is enough |
| `npm run scan` | Whole history | Reads a local clone, no API at all. Best for big or private repositories |

To use the scanner:

```bash
npm run scan -- path/to/your/repo > my-repo.city.json
```

Then click **Open snapshot** (or drop the file onto the page). Needs Node.js 22.18 or later.

## Themes

The look is a swappable skin, separate from the layout. There are three for now: **Daylight**, **Dusk** and **Cyberpunk**. A theme is one entry in [`src/themes.ts`](src/themes.ts): sky, grass, roads and sidewalks, wall and roof colors for each kind of building, window colors, how many windows are lit, and lighting. Japanese streets and a European old town are planned.

## Run locally

```bash
npm install
npm run dev     # http://localhost:5173/?repo=vitejs/vite
npm test
npm run build   # static site in dist/
npm run scan -- ../some-repo > some-repo.city.json
```

Built with TypeScript, [Three.js](https://threejs.org/), [d3-hierarchy](https://github.com/d3/d3-hierarchy) (treemap) and Vite. No server: everything runs in the browser.

## Roadmap

| Version | What |
|---|---|
| v0.1 | The city as the repository is today ← now |
| v0.2 | Replay the history: a timeline slider that grows the city commit by commit |
| v0.3 | More themes (Japanese streets, European old town), video/GIF export |
| v1.0 | Highlight hotspots (big files that change often), a gallery of famous open-source cities, and a write-up |

## License

[MIT](LICENSE)
