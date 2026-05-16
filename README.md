# diagram-scrape

Utilities and experiments for collecting Mermaid diagrams, converting them to SVG, detecting text overlap, and repairing label placement using direct Penrose Bloom optimization with fallback behavior.

## What this repo does

This workspace currently supports four related workflows:

1. Scrape Mermaid source files from GitHub.
2. Convert Mermaid source (`.mmd` / `.mermaid`) to SVG.
3. Detect text overlap in SVGs from a browser UI and export CSV.
4. Repair text label placement in SVG with a Bloom-first pipeline.

The repository also includes pre-collected Mermaid sources in `mermaid/` and compiled SVGs in `svg/`.

## Current status

- The repair pipeline is implemented and validated on `example.svg`.
- Placement constraints are now applied generally across Mermaid and Vega-Lite-like SVGs.
- The web app provides a one-click `Repair example.svg` action with before/after preview.

## Requirements

### Base

- Node.js 18+
- npm

### For direct Bloom in Node (macOS)

Direct `@penrose/bloom` usage in Node requires browser-like globals and canvas text measurement support. On macOS:

```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
npm install canvas
```

Then install project dependencies:

```bash
npm install
```

## Quick start

### 1) Run the repair pipeline on example.svg

```bash
npm run repair:example
```

This writes:

- `svg_repaired/example.repaired.svg`
- `reports/repair-report.jsonl`
- `reports/bloom-models/example.bloom-model.json`

Use `npm run repair:example:no-model` to skip model JSON generation.

### 2) Run the web app

```bash
node server.js
```

Open `http://localhost:3000`.

UI actions:

- `Process SVGs`: runs overlap detection over files from `/mermaidsvg`.
- `Download CSV`: exports overlap findings.
- `Repair example.svg`: runs the repair API and refreshes after-image.

## Repair pipeline behavior

Core implementation is in `repairSvgWithBloom.js`.

### Solver strategy

1. Attempt direct Bloom optimization (`@penrose/bloom`).
2. Run local iterative fallback solver.
3. Compare overlap counts and keep the better result.

### Constraint strategy (global, not provisional)

- Pairwise text disjoint constraints.
- Anchor proximity objective.
- Crowd-aware adaptive weighting.
- Crowd-aware max distance from label to anchor.
- Viewport containment clamping from approximate text bounding boxes.

The intended tradeoff is:

- fewer severe overlaps,
- stronger label-point association,
- no text clipped outside SVG viewport.

## Validation and diagnostics

### Check recent repair reports

```bash
npm run repair:tail-report
```

Key fields in each report record:

- `diagramType`
- `solverUsed`
- `bloomError`
- `bloomSteps`
- `overlapsBefore`
- `overlapsAfter`

### Example containment check

```bash
node -e "const fs=require('fs');const {JSDOM}=require('jsdom');const svg=fs.readFileSync('svg_repaired/example.repaired.svg','utf8');const dom=new JSDOM(svg,{contentType:'image/svg+xml'});const doc=dom.window.document;const root=doc.querySelector('svg');const W=parseFloat(root.getAttribute('width')||'1000');const H=parseFloat(root.getAttribute('height')||'1000');const tr=v=>{const m=/translate\\(([-\\d.]+)\\s*,\\s*([-\\d.]+)\\)/.exec(v||'');return m?{x:+m[1],y:+m[2]}:null;};const fsz=n=>{const m=/([\\d.]+)/.exec(n.getAttribute('font-size')||'11');return m?+m[1]:11;};let outside=0;for(const n of doc.querySelectorAll('text')){const p=tr(n.getAttribute('transform'));if(p==null) continue;const s=(n.textContent||'').trim();const f=fsz(n);const w=Math.max(1,s.length)*f*0.58;const h=f;const x0=p.x-w/2;const y0=p.y-h;const x1=x0+w;const y1=y0+h;if(x0<0||y0<0||x1>W||y1>H) outside++;}console.log(JSON.stringify({width:W,height:H,outsideTextCount:outside}));"
```

## Web/API endpoints

Served by `server.js` on port `3000`:

- `GET /mermaidsvg`: returns SVG filenames from `svg/`.
- `GET /api/example-diagram`: returns input/repaired example paths.
- `POST /api/repair/example`: runs repair pipeline for `example.svg` and returns report JSON.
- Static:
	- `/` from `public/`
	- `/svg` from `svg/`
	- `/svg_repaired` from `svg_repaired/`

## Data collection and conversion scripts

### `scrapeMermaidFromGithub.js`

- Searches GitHub code for Mermaid files by keyword.
- Downloads raw files and appends UUIDs to filenames.
- Writes into keyword-specific folders.

### `convertMermaidToSVG.js`

- Converts Mermaid files to SVG via Mermaid CLI (`mmdc`).
- Logs processed files and errors.

Note: both scripts currently contain machine-specific absolute paths and are intended as utility scripts. Update paths before running on another machine.

## Directory overview

- `mermaid/` scraped Mermaid sources by type
- `svg/` source SVG corpus
- `svg_repaired/` repaired SVG outputs
- `public/` browser UI and overlap detection code
- `reports/` repair reports and model snapshots

## Known limitations

- Validation is currently centered on `example.svg`; broad Mermaid corpus benchmarking is still pending.
- Bounding boxes use approximation in Node-side repair logic.
- No automated test suite is defined in `package.json` yet.

## Next recommended steps

1. Add corpus-level benchmark scripts for Mermaid classes (flowchart, class, sequence, etc.).
2. Add regression tests around overlap count, distance-to-anchor, and viewport clipping.
3. Introduce optional per-diagram-type tuning profiles after benchmark baselines are collected.
