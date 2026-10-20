English | [日本語](README.ja.md)

# commit-city

**Turn any GitHub repository into a 3D city and replay its history.**

Paste a repository and its code becomes a city in your browser: folders are districts, files are buildings, and bigger files are taller. Fly around, click a building, and jump to that file on GitHub.

![three.js as a city](docs/screenshot.png)

> Status: v0.1. The city shows the repository as it is today. Replaying the commit history is next (see the roadmap).

## How to read the city

| In the city | In the repository |
|---|---|
| District (raised plate) | Folder. Deeper folders sit higher. |
| Building | File |
| Height | File size (log scale, so one huge bundle doesn't hide everything else) |
| Footprint | Also file size, but much flatter, so the skyline does the talking |
| Color | Kind of file (JS/TS, Python, docs, config, ...) |

Districts are laid out with a squarified treemap, and all buildings are drawn as one instanced mesh, so repositories with tens of thousands of files stay smooth.

## Use it

Open the page with a repository in the URL:

```
https://keito118.github.io/commit-city/?repo=vitejs/vite
https://keito118.github.io/commit-city/?repo=mrdoob/three.js&theme=cyberpunk
```

Or type `owner/repo` (or a GitHub URL) into the box. The URL updates as you go, so you can share the exact city you're looking at.

- Drag to orbit, right-drag to pan, scroll to zoom.
- Click a building to see its path and size, with a link to the file.
- Pick a look from **Theme**.

Only public repositories work, through GitHub's unauthenticated API (60 requests an hour per IP; each city costs 2).

## Themes

The look is a swappable skin, separate from the layout. v0.1 ships **Daylight** and **Cyberpunk**. A theme is one entry in [`src/themes.ts`](src/themes.ts): sky, ground, district colors, a color per file kind, and how much the buildings glow. Japanese streets and a European old town are planned.

## Run locally

```bash
npm install
npm run dev     # http://localhost:5173/?repo=vitejs/vite
npm test
npm run build   # static site in dist/
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
