import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);
const mathjaxPackage = require("mathjax-full/package.json") as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    PACKAGE_VERSION: JSON.stringify(mathjaxPackage.version),
  },
  build: {
    chunkSizeWarningLimit: 4000,
  },
  resolve: {
    alias: {
      react: fileURLToPath(new URL("./node_modules/react", import.meta.url)),
      "react-dom": fileURLToPath(new URL("./node_modules/react-dom", import.meta.url)),
      "react/jsx-dev-runtime": fileURLToPath(new URL("./node_modules/react/jsx-dev-runtime.js", import.meta.url)),
      "react/jsx-runtime": fileURLToPath(new URL("./node_modules/react/jsx-runtime.js", import.meta.url)),
    },
    dedupe: ["react", "react-dom"],
  },
});
