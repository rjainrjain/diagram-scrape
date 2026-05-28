import {
  DiagramBuilder,
  canvas,
  constraints,
  objectives,
  type Shape,
} from "@penrose/bloom/dist/index_no_react.js";

export type DiagramType =
  | "classDiagram"
  | "sequenceDiagram"
  | "flowchart"
  | "mermaidUnknown"
  | "vegaLikeScatter"
  | "unknown";

export interface RepairReport {
  timestamp: string;
  input?: string;
  output?: string;
  diagramType: DiagramType;
  labelCount: number;
  bloomAttempted: boolean;
  bloomError: string | null;
  solverUsed: "bloom-direct";
  bloomSteps: number;
  overlapsBefore: number;
  overlapsAfter: number;
}

export interface BloomModel {
  runtime: string;
  diagramType: DiagramType;
  variableCount: number;
  constraintCount: number;
  variables: Array<{
    id: string;
    x: number;
    y: number;
  }>;
  constraints: Array<Record<string, unknown>>;
}

export interface RepairSvgOptions {
  inputName?: string;
  now?: () => Date;
}

export interface RepairSvgResult {
  svg: string;
  report: RepairReport;
  bloomModel: BloomModel;
}

interface Point {
  x: number;
  y: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface TextBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Label {
  id: string;
  text: string;
  node: Element;
  anchor: Point;
  fontSize: number;
  x: number;
  y: number;
  crowdScore?: number;
}

interface Scene {
  svgRoot: Element;
  type: DiagramType;
  labels: Label[];
}

type BloomTextShape = Shape & {
  center: Parameters<typeof objectives.inDirection>[0];
};

function parseTranslate(transformValue: string | null): Point | null {
  if (!transformValue) {
    return null;
  }

  const match = /translate\(([-\d.]+)\s*,\s*([-\d.]+)\)/.exec(transformValue);
  if (!match) {
    return null;
  }

  return {
    x: parseFloat(match[1]!),
    y: parseFloat(match[2]!),
  };
}

function formatTranslate(x: number, y: number): string {
  return `translate(${x},${y})`;
}

function getFontSize(node: Element, fallback = 11): number {
  const raw = node.getAttribute("font-size") || "";
  const match = /([\d.]+)/.exec(raw);
  return match ? parseFloat(match[1]!) : fallback;
}

function getTextApproxBBox(text: string, x: number, y: number, fontSize: number): TextBox {
  const width = Math.max(1, text.length) * fontSize * 0.58;
  const height = fontSize;
  return {
    x: x - width / 2,
    y: y - height,
    width,
    height,
  };
}

function getSvgBounds(svgRoot: Element): Bounds {
  return {
    minX: 0,
    minY: 0,
    maxX: parseFloat(svgRoot.getAttribute("width") || "1000") || 1000,
    maxY: parseFloat(svgRoot.getAttribute("height") || "1000") || 1000,
  };
}

function getMaxAnchorDistance(label: Label, diagramType: DiagramType): number {
  const crowd = Math.max(0, Math.min(1, label.crowdScore || 0));

  if (diagramType === "vegaLikeScatter") {
    return 24 + 8 * crowd;
  }

  return 28 + 10 * crowd;
}

function applyViewportAndAnchorConstraints(
  labels: Label[],
  bounds: Bounds,
  diagramType: DiagramType,
  distanceScale = 1,
): Label[] {
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

function computeCrowdingScores(labels: Label[]): void {
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

function overlapArea(a: TextBox, b: TextBox): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  if (x1 <= x0 || y1 <= y0) {
    return 0;
  }
  return (x1 - x0) * (y1 - y0);
}

function extractGeoKey(ariaLabel: string | null): string | null {
  if (!ariaLabel) {
    return null;
  }

  const lonMatch = /lon:\s*([^;]+)/.exec(ariaLabel);
  const latMatch = /lat:\s*([^;]+)/.exec(ariaLabel);
  if (!lonMatch || !latMatch) {
    return null;
  }

  return `${lonMatch[1]!.trim()}|${latMatch[1]!.trim()}`;
}

function detectDiagramType(svgRoot: Element): DiagramType {
  const className = svgRoot.getAttribute("class") || "";
  const desc = `${svgRoot.getAttribute("aria-roledescription") || ""}`.toLowerCase();

  if (className.includes("mermaid")) {
    const text = svgRoot.outerHTML;
    if (/classDiagram/i.test(text)) return "classDiagram";
    if (/sequenceDiagram/i.test(text)) return "sequenceDiagram";
    if (/flowchart|graph TD|graph LR/i.test(text)) return "flowchart";
    return "mermaidUnknown";
  }

  if (className.includes("marks") && /graphics-object/.test(svgRoot.outerHTML)) {
    return "vegaLikeScatter";
  }

  if (desc.includes("flowchart")) {
    return "flowchart";
  }

  return "unknown";
}

function buildScene(document: Document): Scene {
  const svgRoot = document.querySelector("svg");
  if (!svgRoot) {
    throw new Error("No <svg> root found in input SVG.");
  }

  const type = detectDiagramType(svgRoot);
  const circles = Array.from(document.querySelectorAll('path[aria-roledescription="circle"]'));
  const texts = Array.from(document.querySelectorAll("text"));

  const anchorByGeo = new Map<string, Point>();
  circles.forEach((circleNode) => {
    const geoKey = extractGeoKey(circleNode.getAttribute("aria-label"));
    const pos = parseTranslate(circleNode.getAttribute("transform"));
    if (geoKey && pos) {
      anchorByGeo.set(geoKey, pos);
    }
  });

  const labels = texts
    .map((textNode, index): Label | null => {
      const transform = parseTranslate(textNode.getAttribute("transform"));
      if (!transform) return null;

      const text = (textNode.textContent || "").trim();
      const fontSize = getFontSize(textNode, 11);
      const geoKey = extractGeoKey(textNode.getAttribute("aria-label"));
      const anchor =
        geoKey && anchorByGeo.has(geoKey)
          ? anchorByGeo.get(geoKey)
          : { x: transform.x, y: transform.y + 7 };

      if (!anchor) {
        return null;
      }

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
    .filter((label): label is Label => Boolean(label));

  computeCrowdingScores(labels);

  return { svgRoot, type, labels };
}

function createBloomModel(scene: Scene): BloomModel {
  const variables = scene.labels.map((label) => ({
    id: label.id,
    x: label.x,
    y: label.y,
  }));

  const constraints: Array<Record<string, unknown>> = [];
  for (const label of scene.labels) {
    constraints.push({
      type: "labelAnchorProximity",
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
      const a = scene.labels[i]!;
      const b = scene.labels[j]!;
      constraints.push({
        type: "textTextNonOverlap",
        a: a.id,
        b: b.id,
        minGap: 2,
        weight: 1,
      });
    }
  }

  if (scene.type === "classDiagram") {
    constraints.push({ type: "classLabelSnap", weight: 1.1 });
  } else if (scene.type === "sequenceDiagram") {
    constraints.push({ type: "lifelineLabelBand", weight: 1.1 });
  } else if (scene.type === "flowchart") {
    constraints.push({ type: "nodeLabelStickiness", weight: 1.1 });
  } else {
    constraints.push({ type: "genericLabelPlacement", weight: 1 });
  }

  return {
    runtime: "Penrose/Bloom direct",
    diagramType: scene.type,
    variableCount: variables.length,
    constraintCount: constraints.length,
    variables,
    constraints,
  };
}

async function optimizeLabelsWithBloom(scene: Scene): Promise<{ optimized: Label[]; steps: number }> {
  const bounds = getSvgBounds(scene.svgRoot);
  const canvasWidth = bounds.maxX;
  const canvasHeight = bounds.maxY;

  const builder = new DiagramBuilder(canvas(canvasWidth, canvasHeight), "example-svg-bloom", 0.2);
  const shapeById = new Map<string, Shape>();

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
      fontFamily: "sans-serif",
      textAnchor: "middle",
      drag: false,
      ensureOnCanvas: true,
    }) as unknown as BloomTextShape;

    shapeById.set(label.id, shape);

    const crowd = Math.max(0, Math.min(1, label.crowdScore || 0));
    const nearWeight = 4.8 - 0.8 * crowd;

    builder.encourage(objectives.nearPt(shape, label.anchor.x, label.anchor.y - 7), nearWeight);
    builder.encourage(objectives.inDirection(shape.center, [label.anchor.x, label.anchor.y], [0, -1], 1.6), 0.9);
  }

  for (let i = 0; i < scene.labels.length; i++) {
    for (let j = i + 1; j < scene.labels.length; j++) {
      const labelA = scene.labels[i]!;
      const labelB = scene.labels[j]!;
      const a = shapeById.get(labelA.id);
      const b = shapeById.get(labelB.id);
      if (!a || !b) {
        throw new Error(`Bloom shape missing for ${labelA.id} or ${labelB.id}.`);
      }
      const pairCrowd = ((labelA.crowdScore || 0) + (labelB.crowdScore || 0)) / 2;
      const disjointWeight = 3.4 + pairCrowd * 1.8;

      builder.ensure(constraints.disjoint(a, b, 2), disjointWeight);
      builder.encourage(objectives.notTooClose(a, b, 15), 0.9);
    }
  }

  const diagram = await builder.build();
  try {
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
      x: Number(diagram.getInput(`${label.id}.x`)),
      y: Number(diagram.getInput(`${label.id}.y`)),
    }));

    applyViewportAndAnchorConstraints(optimized, bounds, scene.type, 1);

    return {
      optimized,
      steps,
    };
  } finally {
    diagram.discard();
  }
}

export function countLabelOverlaps(labels: Array<Pick<Label, "text" | "x" | "y" | "fontSize">>): number {
  let count = 0;
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i]!;
      const b = labels[j]!;
      const boxA = getTextApproxBBox(a.text, a.x, a.y, a.fontSize);
      const boxB = getTextApproxBBox(b.text, b.x, b.y, b.fontSize);
      if (overlapArea(boxA, boxB) > 0) {
        count++;
      }
    }
  }
  return count;
}

function parseSvg(svgText: string): Document {
  if (typeof DOMParser === "undefined") {
    throw new Error("DOMParser is not available. Node callers must install the Node DOM adapter first.");
  }

  const document = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (document.querySelector("parsererror")) {
    throw new Error("Input is not valid SVG XML.");
  }
  return document;
}

function serializeSvg(document: Document): string {
  if (typeof XMLSerializer === "undefined") {
    throw new Error("XMLSerializer is not available. Node callers must install the Node DOM adapter first.");
  }

  return new XMLSerializer().serializeToString(document);
}

export async function repairSVGWithBloom(svgText: string, options: RepairSvgOptions = {}): Promise<RepairSvgResult> {
  const document = parseSvg(svgText);
  const scene = buildScene(document);
  const beforeOverlapCount = countLabelOverlaps(scene.labels);
  const bloomModel = createBloomModel(scene);
  const bloomResult = await optimizeLabelsWithBloom(scene);
  const optimizedLabels = bloomResult.optimized;

  for (const label of optimizedLabels) {
    label.node.setAttribute("transform", formatTranslate(label.x, label.y));
  }

  const afterOverlapCount = countLabelOverlaps(optimizedLabels);
  const timestamp = (options.now ? options.now() : new Date()).toISOString();

  const report: RepairReport = {
    timestamp,
    input: options.inputName,
    diagramType: scene.type,
    labelCount: scene.labels.length,
    bloomAttempted: true,
    bloomError: null,
    solverUsed: "bloom-direct",
    bloomSteps: bloomResult.steps,
    overlapsBefore: beforeOverlapCount,
    overlapsAfter: afterOverlapCount,
  };

  return {
    svg: serializeSvg(document),
    report,
    bloomModel,
  };
}

export const repairSvgWithBloom = repairSVGWithBloom;
