import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repairSvgFileWithBloom } from "@diagram-scrape/svg-repair/node";

const DEFAULT_PORT = 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "../..");

export function createApp() {
  const app = express();

  app.use(express.static(path.join(workspaceRoot, "public")));
  app.use("/svg", express.static(path.join(workspaceRoot, "svg")));
  app.use("/svg_repaired", express.static(path.join(workspaceRoot, "svg_repaired")));

  app.get("/example.svg", (_req, res) => {
    res.sendFile(path.join(workspaceRoot, "example.svg"));
  });

  app.get("/mermaidsvg", (_req, res) => {
    const svgDir = path.join(workspaceRoot, "svg");
    fs.readdir(svgDir, (err, files) => {
      if (err) {
        return res.status(500).json({ error: "Unable to read SVG directory" });
      }

      const svgFiles = files.filter((file) => path.extname(file) === ".svg");
      return res.json(svgFiles);
    });
  });

  app.use("/mermaidsvg", express.static(path.join(workspaceRoot, "svg")));

  app.get("/api/example-diagram", (_req, res) => {
    res.json({
      input: "/example.svg",
      repaired: "/svg_repaired/example.repaired.svg",
    });
  });

  app.post("/api/repair/example", async (_req, res) => {
    try {
      const report = await repairSvgFileWithBloom({
        input: "example.svg",
        workspaceRoot,
      });
      return res.json({ ok: true, report });
    } catch (error) {
      return res.status(500).json({
        error: "Example repair failed",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return app;
}

export function startServer(port = Number(process.env.PORT || DEFAULT_PORT)) {
  const app = createApp();
  const server = app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer();
}
