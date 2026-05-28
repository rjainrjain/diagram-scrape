import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/basic-languages/xml/xml.contribution";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";

(self as any).MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "html" || label === "xml") {
      return new htmlWorker();
    }

    return new editorWorker();
  },
};

loader.config({ monaco });
