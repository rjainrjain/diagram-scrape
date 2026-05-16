const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const DEFAULT_INPUT = 'example.svg';
const DEFAULT_OUTPUT_DIR = 'svg_repaired';
const DEFAULT_REPORT_PATH = path.join('reports', 'repair-report.jsonl');
const DEFAULT_MODEL_DIR = path.join('reports', 'bloom-models');

function ensureBrowserGlobals() {
  if (typeof globalThis.window !== 'undefined' && typeof globalThis.document !== 'undefined') {
    return;
  }

  const envDom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
  });

  globalThis.window = envDom.window;
  globalThis.document = envDom.window.document;
  globalThis.HTMLElement = envDom.window.HTMLElement;
  globalThis.SVGElement = envDom.window.SVGElement;
  globalThis.DOMParser = envDom.window.DOMParser;
  globalThis.navigator = envDom.window.navigator;

  if (typeof globalThis.performance === 'undefined') {
    globalThis.performance = envDom.window.performance;
  }

  globalThis.requestAnimationFrame = envDom.window.requestAnimationFrame.bind(envDom.window);
  globalThis.cancelAnimationFrame = envDom.window.cancelAnimationFrame.bind(envDom.window);
}

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    outputDir: DEFAULT_OUTPUT_DIR,
    reportPath: DEFAULT_REPORT_PATH,
    modelDir: DEFAULT_MODEL_DIR,
    writeModel: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--input' && argv[i + 1]) {
      args.input = argv[++i];
    } else if (token === '--outputDir' && argv[i + 1]) {
      args.outputDir = argv[++i];
    } else if (token === '--report' && argv[i + 1]) {
      args.reportPath = argv[++i];
    } else if (token === '--modelDir' && argv[i + 1]) {
      args.modelDir = argv[++i];
    } else if (token === '--no-model') {
      args.writeModel = false;
    }
  }

  return args;
}

function toAbsolute(baseDir, maybeRelative) {
  return path.isAbsolute(maybeRelative)
    ? maybeRelative
    : path.join(baseDir, maybeRelative);
}

function ensureDir(fileOrDirPath, asFile = false) {
  const target = asFile ? path.dirname(fileOrDirPath) : fileOrDirPath;
  fs.mkdirSync(target, { recursive: true });
}

function readSvg(inputPath) {
  return fs.readFileSync(inputPath, 'utf8');
}

function parseTranslate(transformValue) {
  if (!transformValue) {
    return null;
  }

  const match = /translate\(([-\d.]+)\s*,\s*([-\d.]+)\)/.exec(transformValue);
  if (!match) {
    return null;
  }

  return {
    x: parseFloat(match[1]),
    y: parseFloat(match[2]),
  };
}

function formatTranslate(x, y) {
  return `translate(${x},${y})`;
}

function getFontSize(node, fallback = 11) {
  const raw = node.getAttribute('font-size') || '';
  const match = /([\d.]+)/.exec(raw);
  return match ? parseFloat(match[1]) : fallback;
}

function getTextApproxBBox(text, x, y, fontSize) {
  const width = Math.max(1, text.length) * fontSize * 0.58;
  const height = fontSize;
  return {
    x: x - width / 2,
    y: y - height,
    width,
    height,
  };
}

function getSvgBounds(svgRoot) {
  return {
    minX: 0,
    minY: 0,
    maxX: parseFloat(svgRoot.getAttribute('width') || '1000') || 1000,
    maxY: parseFloat(svgRoot.getAttribute('height') || '1000') || 1000,
  };
}

function getMaxAnchorDistance(label, diagramType) {
  const crowd = Math.max(0, Math.min(1, label.crowdScore || 0));

  if (diagramType === 'vegaLikeScatter') {
    return 24 + 8 * crowd;
  }

  return 28 + 10 * crowd;
}

function applyViewportAndAnchorConstraints(labels, bounds, diagramType, distanceScale = 1) {
  const edgePadding = 4;

  for (const label of labels) {
    const maxAnchorDistance = getMaxAnchorDistance(label, diagramType) * distanceScale;
    const preferredX = label.anchor.x;
    const preferredY = label.anchor.y - 7;

    const dx = label.x - preferredX;
    const dy = label.y - preferredY;
    const distance = Math.hypot(dx, dy);
    if (distance > maxAnchorDistance && distance > 0) {
      const scale = maxAnchorDistance / distance;
      label.x = preferredX + dx * scale;
      label.y = preferredY + dy * scale;
    }

    const halfWidth = (Math.max(1, label.text.length) * label.fontSize * 0.58) / 2;
    const textHeight = label.fontSize;

    const minCenterX = bounds.minX + edgePadding + halfWidth;
    const maxCenterX = bounds.maxX - edgePadding - halfWidth;
    const minBaselineY = bounds.minY + edgePadding + textHeight;
    const maxBaselineY = bounds.maxY - edgePadding;

    label.x = Math.max(minCenterX, Math.min(maxCenterX, label.x));
    label.y = Math.max(minBaselineY, Math.min(maxBaselineY, label.y));
  }

  return labels;
}

function computeCrowdingScores(labels) {
  const radius = 34;
  const maxNeighborsForNormalization = 6;

  for (const label of labels) {
    let neighbors = 0;
    for (const other of labels) {
      if (other.id === label.id) continue;
      const dist = Math.hypot(label.anchor.x - other.anchor.x, label.anchor.y - other.anchor.y);
      if (dist <= radius) neighbors += 1;
    }

    label.crowdScore = Math.min(1, neighbors / maxNeighborsForNormalization);
  }
}

function overlapArea(a, b) {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  if (x1 <= x0 || y1 <= y0) {
    return 0;
  }
  return (x1 - x0) * (y1 - y0);
}

function extractGeoKey(ariaLabel) {
  if (!ariaLabel) {
    return null;
  }

  const lonMatch = /lon:\s*([^;]+)/.exec(ariaLabel);
  const latMatch = /lat:\s*([^;]+)/.exec(ariaLabel);
  if (!lonMatch || !latMatch) {
    return null;
  }

  return `${lonMatch[1].trim()}|${latMatch[1].trim()}`;
}

function detectDiagramType(svgRoot) {
  const className = svgRoot.getAttribute('class') || '';
  const desc = `${svgRoot.getAttribute('aria-roledescription') || ''}`.toLowerCase();

  if (className.includes('mermaid')) {
    const text = svgRoot.outerHTML;
    if (/classDiagram/i.test(text)) return 'classDiagram';
    if (/sequenceDiagram/i.test(text)) return 'sequenceDiagram';
    if (/flowchart|graph TD|graph LR/i.test(text)) return 'flowchart';
    return 'mermaidUnknown';
  }

  if (className.includes('marks') && /graphics-object/.test(svgRoot.outerHTML)) {
    return 'vegaLikeScatter';
  }

  return 'unknown';
}

function buildScene(document) {
  const svgRoot = document.querySelector('svg');
  if (!svgRoot) {
    throw new Error('No <svg> root found in input file.');
  }

  const type = detectDiagramType(svgRoot);
  const circles = Array.from(document.querySelectorAll('path[aria-roledescription="circle"]'));
  const texts = Array.from(document.querySelectorAll('text'));

  const anchorByGeo = new Map();
  circles.forEach((circleNode) => {
    const geoKey = extractGeoKey(circleNode.getAttribute('aria-label'));
    const pos = parseTranslate(circleNode.getAttribute('transform'));
    if (geoKey && pos) {
      anchorByGeo.set(geoKey, pos);
    }
  });

  const labels = texts
    .map((textNode, index) => {
      const transform = parseTranslate(textNode.getAttribute('transform'));
      if (!transform) return null;

      const text = (textNode.textContent || '').trim();
      const fontSize = getFontSize(textNode, 11);
      const geoKey = extractGeoKey(textNode.getAttribute('aria-label'));
      const anchor = geoKey && anchorByGeo.has(geoKey)
        ? anchorByGeo.get(geoKey)
        : { x: transform.x, y: transform.y + 7 };

      return {
        id: `label-${index}`,
        text,
        node: textNode,
        anchor,
        fontSize,
        x: transform.x,
        y: transform.y,
      };
    })
    .filter(Boolean);

  computeCrowdingScores(labels);

  return { svgRoot, type, labels };
}

function createBloomModel(scene) {
  const variables = scene.labels.map((label) => ({
    id: label.id,
    x: label.x,
    y: label.y,
  }));

  const constraints = [];
  for (const label of scene.labels) {
    constraints.push({
      type: 'labelAnchorProximity',
      labelId: label.id,
      anchorX: label.anchor.x,
      anchorY: label.anchor.y,
      preferredDistance: 7,
      maxDistance: getMaxAnchorDistance(label, scene.type),
      weight: 1.5,
    });
  }

  for (let i = 0; i < scene.labels.length; i++) {
    for (let j = i + 1; j < scene.labels.length; j++) {
      constraints.push({
        type: 'textTextNonOverlap',
        a: scene.labels[i].id,
        b: scene.labels[j].id,
        minGap: 2,
        weight: 1,
      });
    }
  }

  if (scene.type === 'classDiagram') {
    constraints.push({ type: 'classLabelSnap', weight: 1.1 });
  } else if (scene.type === 'sequenceDiagram') {
    constraints.push({ type: 'lifelineLabelBand', weight: 1.1 });
  } else if (scene.type === 'flowchart') {
    constraints.push({ type: 'nodeLabelStickiness', weight: 1.1 });
  } else {
    constraints.push({ type: 'genericLabelPlacement', weight: 1 });
  }

  return {
    runtime: 'Penrose/Bloom direct (plus fallback)',
    diagramType: scene.type,
    variableCount: variables.length,
    constraintCount: constraints.length,
    variables,
    constraints,
  };
}

async function optimizeLabelsWithBloom(scene) {
  ensureBrowserGlobals();
  const bloom = await import('@penrose/bloom/dist/index_no_react.js');
  const {
    DiagramBuilder,
    canvas,
    constraints,
    objectives,
  } = bloom;

  const bounds = getSvgBounds(scene.svgRoot);
  const canvasWidth = bounds.maxX;
  const canvasHeight = bounds.maxY;

  const builder = new DiagramBuilder(canvas(canvasWidth, canvasHeight), 'example-svg-bloom', 0.2);
  const shapeById = new Map();

  for (const label of scene.labels) {
    const x = builder.input({
      name: `${label.id}.x`,
      init: label.x,
      optimized: true,
    });

    const y = builder.input({
      name: `${label.id}.y`,
      init: label.y,
      optimized: true,
    });

    const shape = builder.text({
      name: label.id,
      string: label.text,
      center: [x, y],
      fontSize: `${Math.max(9, label.fontSize)}px`,
      fontFamily: 'sans-serif',
      textAnchor: 'middle',
      drag: false,
      ensureOnCanvas: true,
    });

    shapeById.set(label.id, shape);

    const crowd = Math.max(0, Math.min(1, label.crowdScore || 0));
    const nearWeight = 4.8 - 0.8 * crowd;

    builder.encourage(objectives.nearPt(shape, label.anchor.x, label.anchor.y - 7), nearWeight);
    builder.encourage(objectives.inDirection(shape.center, [label.anchor.x, label.anchor.y], [0, -1], 1.6), 0.9);
  }

  for (let i = 0; i < scene.labels.length; i++) {
    for (let j = i + 1; j < scene.labels.length; j++) {
      const a = shapeById.get(scene.labels[i].id);
      const b = shapeById.get(scene.labels[j].id);
      const pairCrowd = ((scene.labels[i].crowdScore || 0) + (scene.labels[j].crowdScore || 0)) / 2;
      const disjointWeight = 3.4 + pairCrowd * 1.8;

      builder.ensure(constraints.disjoint(a, b, 2), disjointWeight);
      builder.encourage(objectives.notTooClose(a, b, 15), 0.9);
    }
  }

  const diagram = await builder.build();
  let steps = 0;
  const maxSteps = 280;

  while (steps < maxSteps) {
    steps += 1;
    const shouldContinue = await diagram.optimizationStep();
    if (!shouldContinue) {
      break;
    }
  }

  const optimized = scene.labels.map((label) => ({
    ...label,
    x: diagram.getInput(`${label.id}.x`),
    y: diagram.getInput(`${label.id}.y`),
  }));

  applyViewportAndAnchorConstraints(optimized, bounds, scene.type, 1);

  diagram.discard();

  return {
    optimized,
    steps,
  };
}

function optimizeLabels(scene, iterations = 120) {
  const state = scene.labels.map((label) => ({
    ...label,
  }));

  const bounds = getSvgBounds(scene.svgRoot);

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < state.length; i++) {
      for (let j = i + 1; j < state.length; j++) {
        const a = state[i];
        const b = state[j];
        const boxA = getTextApproxBBox(a.text, a.x, a.y, a.fontSize);
        const boxB = getTextApproxBBox(b.text, b.x, b.y, b.fontSize);
        const area = overlapArea(boxA, boxB);
        if (area <= 0) continue;

        const dx = (a.x - b.x) || 0.1;
        const dy = (a.y - b.y) || 0.1;
        const mag = Math.hypot(dx, dy);
        const ux = dx / mag;
        const uy = dy / mag;
        const push = Math.min(1.4, 0.04 * area + 0.05);

        a.x += ux * push;
        a.y += uy * push;
        b.x -= ux * push;
        b.y -= uy * push;
      }
    }

    for (const label of state) {
      const anchorBias = scene.type === 'vegaLikeScatter' ? 0.25 : 0.18;
      label.x += (label.anchor.x - label.x) * anchorBias;
      label.y += (label.anchor.y - 7 - label.y) * anchorBias;

      // Keep loop permissive enough to let labels separate, then tighten at end.
      applyViewportAndAnchorConstraints([label], bounds, scene.type, 1.15);
    }
  }

  applyViewportAndAnchorConstraints(state, bounds, scene.type, 1);

  return state;
}

function countOverlaps(labels) {
  let count = 0;
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i];
      const b = labels[j];
      const boxA = getTextApproxBBox(a.text, a.x, a.y, a.fontSize);
      const boxB = getTextApproxBBox(b.text, b.x, b.y, b.fontSize);
      if (overlapArea(boxA, boxB) > 0) {
        count++;
      }
    }
  }
  return count;
}

function writeReport(reportPath, payload) {
  ensureDir(reportPath, true);
  fs.appendFileSync(reportPath, `${JSON.stringify(payload)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workspaceRoot = process.cwd();

  const inputPath = toAbsolute(workspaceRoot, args.input);
  const outputDir = toAbsolute(workspaceRoot, args.outputDir);
  const reportPath = toAbsolute(workspaceRoot, args.reportPath);
  const modelDir = toAbsolute(workspaceRoot, args.modelDir);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input SVG not found: ${inputPath}`);
  }

  ensureDir(outputDir);
  ensureDir(modelDir);

  const rawSvg = readSvg(inputPath);
  const dom = new JSDOM(rawSvg, { contentType: 'image/svg+xml' });
  const document = dom.window.document;

  const scene = buildScene(document);
  const beforeOverlapCount = countOverlaps(scene.labels);
  const bloomModel = createBloomModel(scene);

  let bloomError = null;
  let bloomResult = null;
  try {
    bloomResult = await optimizeLabelsWithBloom(scene);
  } catch (error) {
    bloomError = error instanceof Error ? error.message : String(error);
  }

  const fallbackResult = optimizeLabels(scene);

  let optimizedLabels = fallbackResult;
  let solverUsed = 'local-fallback';
  let bloomSteps = 0;

  if (bloomResult && bloomResult.optimized) {
    const bloomOverlaps = countOverlaps(bloomResult.optimized);
    const fallbackOverlaps = countOverlaps(fallbackResult);

    if (bloomOverlaps <= fallbackOverlaps) {
      optimizedLabels = bloomResult.optimized;
      solverUsed = 'bloom-direct';
      bloomSteps = bloomResult.steps;
    } else {
      solverUsed = 'local-fallback-after-bloom';
      bloomSteps = bloomResult.steps;
    }
  }

  for (const label of optimizedLabels) {
    label.node.setAttribute('transform', formatTranslate(label.x, label.y));
  }

  const afterOverlapCount = countOverlaps(optimizedLabels);
  const outputName = `${path.basename(inputPath, '.svg')}.repaired.svg`;
  const outputPath = path.join(outputDir, outputName);

  fs.writeFileSync(outputPath, dom.serialize(), 'utf8');

  if (args.writeModel) {
    const modelPath = path.join(modelDir, `${path.basename(inputPath, '.svg')}.bloom-model.json`);
    fs.writeFileSync(modelPath, JSON.stringify(bloomModel, null, 2), 'utf8');
  }

  const report = {
    timestamp: new Date().toISOString(),
    input: path.relative(workspaceRoot, inputPath),
    output: path.relative(workspaceRoot, outputPath),
    diagramType: scene.type,
    labelCount: scene.labels.length,
    bloomAttempted: true,
    bloomError,
    solverUsed,
    bloomSteps,
    overlapsBefore: beforeOverlapCount,
    overlapsAfter: afterOverlapCount,
  };

  writeReport(reportPath, report);

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('repairSvgWithBloom failed:', error.message);
  process.exit(1);
});
