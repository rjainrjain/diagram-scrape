import { type ChangeEvent, Suspense, lazy, useMemo, useState } from "react";
import { repairSVGWithBloom, type RepairReport } from "@diagram-scrape/svg-repair";
import defaultSvg from "../../../example.svg?raw";

type StatusKind = "idle" | "working" | "success" | "error";
const SvgSourceEditor = lazy(() => import("./SvgSourceEditor"));

interface Status {
  kind: StatusKind;
  message: string;
}

function validateSvg(svgText: string): string | null {
  const document = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (document.querySelector("parsererror") || document.documentElement.nodeName.toLowerCase() !== "svg") {
    return "The current document is not valid SVG XML.";
  }

  return null;
}

function fileNameFromUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === "data:") {
      return "downloaded.svg";
    }
    const lastSegment = url.pathname.split("/").filter(Boolean).at(-1);
    return lastSegment ? decodeURIComponent(lastSegment) : "downloaded.svg";
  } catch {
    return "downloaded.svg";
  }
}

function asSvgFileName(value: string): string {
  const trimmed = value.trim() || "diagram.svg";
  return trimmed.toLowerCase().endsWith(".svg") ? trimmed : `${trimmed}.svg`;
}

function formatReport(report: RepairReport): string {
  return [
    `Repair complete`,
    `solver=${report.solverUsed}`,
    `labels=${report.labelCount}`,
    `overlaps ${report.overlapsBefore} -> ${report.overlapsAfter}`,
  ].join(" | ");
}

export default function App() {
  const [svgText, setSvgText] = useState(defaultSvg);
  const [fileName, setFileName] = useState("example.svg");
  const [sourceUrl, setSourceUrl] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [status, setStatus] = useState<Status>({
    kind: "idle",
    message: "Loaded example.svg",
  });

  const svgError = useMemo(() => validateSvg(svgText), [svgText]);
  const previewDoc = useMemo(
    () => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        height: 100%;
        margin: 0;
        background: #f7f7f4;
      }
      body {
        display: grid;
        place-items: center;
        overflow: auto;
      }
      svg {
        max-width: calc(100vw - 32px);
        max-height: calc(100vh - 32px);
      }
    </style>
  </head>
  <body>${svgText}</body>
</html>`,
    [svgText],
  );

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setSvgText(text);
      setFileName(asSvgFileName(file.name));
      setStatus({ kind: "success", message: `Loaded ${file.name}` });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Unable to read the selected file.",
      });
    } finally {
      input.value = "";
    }
  }

  async function handleUrlLoad() {
    if (!sourceUrl.trim()) {
      setStatus({ kind: "error", message: "Enter an SVG URL first." });
      return;
    }

    setStatus({ kind: "working", message: "Loading SVG from URL..." });
    try {
      const response = await fetch(sourceUrl.trim());
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }

      const text = await response.text();
      const validationError = validateSvg(text);
      if (validationError) {
        throw new Error(validationError);
      }

      const nextFileName = asSvgFileName(fileNameFromUrl(sourceUrl));
      setSvgText(text);
      setFileName(nextFileName);
      setStatus({ kind: "success", message: `Loaded ${nextFileName}` });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error
            ? `Unable to load URL: ${error.message}`
            : "Unable to load URL. The server may not allow browser CORS requests.",
      });
    }
  }

  async function handleRepair() {
    const validationError = validateSvg(svgText);
    if (validationError) {
      setStatus({ kind: "error", message: validationError });
      return;
    }

    setIsRepairing(true);
    setStatus({ kind: "working", message: "Repairing SVG..." });

    try {
      const result = await repairSVGWithBloom(svgText, { inputName: fileName });
      setSvgText(result.svg);
      setStatus({ kind: "success", message: formatReport(result.report) });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "SVG repair failed.",
      });
    } finally {
      setIsRepairing(false);
    }
  }

  function handleDownload() {
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = asSvgFileName(fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <header className="toolbar" aria-label="SVG editor controls">
        <div className="title-block">
          <h1>SVG Repair Editor</h1>
          <p>{fileName}</p>
        </div>

        <div className="toolbar-actions">
          <label className="file-picker">
            <input type="file" accept=".svg,image/svg+xml" onChange={handleFileUpload} />
            Upload File
          </label>
          <button type="button" onClick={handleDownload}>
            Download
          </button>
          <button type="button" onClick={handleRepair} disabled={isRepairing || Boolean(svgError)}>
            {isRepairing ? "Repairing..." : "Repair"}
          </button>
          <button type="button" className="secondary" onClick={() => setIsEditorOpen((value) => !value)}>
            {isEditorOpen ? "Hide Editor" : "Show Editor"}
          </button>
        </div>
      </header>

      <section className="url-row" aria-label="Load SVG from URL">
        <input
          type="url"
          value={sourceUrl}
          onChange={(event) => setSourceUrl(event.currentTarget.value)}
          placeholder="https://example.com/diagram.svg"
          aria-label="SVG URL"
        />
        <button type="button" className="secondary" onClick={handleUrlLoad}>
          Load URL
        </button>
      </section>

      <div className={`status status-${svgError ? "error" : status.kind}`} role="status">
        {svgError || status.message}
      </div>

      <section className="preview-pane" aria-label="SVG preview">
        <iframe title="SVG preview" sandbox="" srcDoc={previewDoc} />
      </section>

      {isEditorOpen ? (
        <section className="editor-pane" aria-label="SVG source editor">
          <Suspense fallback={<div className="editor-loading">Loading editor...</div>}>
            <SvgSourceEditor fileName={fileName} svgText={svgText} onChange={setSvgText} />
          </Suspense>
        </section>
      ) : null}
    </main>
  );
}
