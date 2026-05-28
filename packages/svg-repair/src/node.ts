import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { repairSVGWithBloom, type RepairReport, type RepairSvgOptions } from "./index.ts";

export const DEFAULT_INPUT = "example.svg";
export const DEFAULT_OUTPUT_DIR = "svg_repaired";
export const DEFAULT_REPORT_PATH = path.join("reports", "repair-report.jsonl");
export const DEFAULT_MODEL_DIR = path.join("reports", "bloom-models");

export interface RepairSvgFileOptions extends RepairSvgOptions {
  input?: string;
  outputDir?: string;
  reportPath?: string;
  modelDir?: string;
  writeModel?: boolean;
  workspaceRoot?: string;
}

function setGlobal(name: string, value: unknown): void {
  const globalScope = globalThis as any;
  try {
    globalScope[name] = value;
  } catch {
    Object.defineProperty(globalScope, name, {
      configurable: true,
      value,
      writable: true,
    });
  }
}

function installCanvasContext(window: any): void {
  if (!window.navigator.userAgent.toLowerCase().includes("jsdom")) {
    return;
  }

  const proto = window.HTMLCanvasElement.prototype as any;
  const originalGetContext = proto.getContext as ((contextId: string, ...args: unknown[]) => unknown) | undefined;

  proto.getContext = function getContext(contextId: string, ...args: unknown[]) {
    if (contextId !== "2d") {
      return originalGetContext ? originalGetContext.call(this, contextId, ...args) : null;
    }

    return {
      font: "10px sans-serif",
      textBaseline: "alphabetic",
      measureText(this: { font: string }, text: string) {
        const fontSize = /([\d.]+)px/.exec(this.font)?.[1];
        const size = fontSize ? Number(fontSize) : 10;
        const width = Math.max(1, text.length) * size * 0.58;
        return {
          actualBoundingBoxAscent: size * 0.8,
          actualBoundingBoxDescent: size * 0.2,
          actualBoundingBoxLeft: 0,
          actualBoundingBoxRight: width,
          width,
        };
      },
    };
  };
}

export function ensureBrowserGlobals(): void {
  const globalScope = globalThis as any;
  if (typeof globalScope.window !== "undefined" && typeof globalScope.document !== "undefined") {
    installCanvasContext(globalScope.window);
    return;
  }

  const envDom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
  });

  setGlobal("window", envDom.window);
  setGlobal("document", envDom.window.document);
  setGlobal("HTMLElement", envDom.window.HTMLElement);
  setGlobal("SVGElement", envDom.window.SVGElement);
  setGlobal("Element", envDom.window.Element);
  setGlobal("DOMParser", envDom.window.DOMParser);
  setGlobal("XMLSerializer", envDom.window.XMLSerializer);
  setGlobal("navigator", envDom.window.navigator);

  if (typeof globalScope.performance === "undefined") {
    setGlobal("performance", envDom.window.performance);
  }

  setGlobal("requestAnimationFrame", envDom.window.requestAnimationFrame.bind(envDom.window));
  setGlobal("cancelAnimationFrame", envDom.window.cancelAnimationFrame.bind(envDom.window));
  installCanvasContext(envDom.window);
}

export function toAbsolute(baseDir: string, maybeRelative: string): string {
  return path.isAbsolute(maybeRelative) ? maybeRelative : path.join(baseDir, maybeRelative);
}

export function ensureDir(fileOrDirPath: string, asFile = false): void {
  const target = asFile ? path.dirname(fileOrDirPath) : fileOrDirPath;
  fs.mkdirSync(target, { recursive: true });
}

export function writeReport(reportPath: string, payload: RepairReport): void {
  ensureDir(reportPath, true);
  fs.appendFileSync(reportPath, `${JSON.stringify(payload)}\n`);
}

export async function repairSvgFileWithBloom(options: RepairSvgFileOptions = {}): Promise<RepairReport> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const inputPath = toAbsolute(workspaceRoot, options.input ?? DEFAULT_INPUT);
  const outputDir = toAbsolute(workspaceRoot, options.outputDir ?? DEFAULT_OUTPUT_DIR);
  const reportPath = toAbsolute(workspaceRoot, options.reportPath ?? DEFAULT_REPORT_PATH);
  const modelDir = toAbsolute(workspaceRoot, options.modelDir ?? DEFAULT_MODEL_DIR);
  const writeModel = options.writeModel ?? true;

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input SVG not found: ${inputPath}`);
  }

  ensureDir(outputDir);
  if (writeModel) {
    ensureDir(modelDir);
  }

  ensureBrowserGlobals();

  const rawSvg = fs.readFileSync(inputPath, "utf8");
  const result = await repairSVGWithBloom(rawSvg, {
    ...options,
    inputName: path.relative(workspaceRoot, inputPath),
  });

  const outputName = `${path.basename(inputPath, ".svg")}.repaired.svg`;
  const outputPath = path.join(outputDir, outputName);

  fs.writeFileSync(outputPath, result.svg, "utf8");

  if (writeModel) {
    const modelPath = path.join(modelDir, `${path.basename(inputPath, ".svg")}.bloom-model.json`);
    fs.writeFileSync(modelPath, JSON.stringify(result.bloomModel, null, 2), "utf8");
  }

  const report: RepairReport = {
    ...result.report,
    input: path.relative(workspaceRoot, inputPath),
    output: path.relative(workspaceRoot, outputPath),
  };

  writeReport(reportPath, report);

  return report;
}
