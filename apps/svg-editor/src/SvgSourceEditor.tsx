import Editor from "@monaco-editor/react";
import "./monacoSetup";

interface SvgSourceEditorProps {
  fileName: string;
  svgText: string;
  onChange: (value: string) => void;
}

export default function SvgSourceEditor({ fileName, svgText, onChange }: SvgSourceEditorProps) {
  return (
    <Editor
      height="42vh"
      language="xml"
      path={fileName}
      theme="vs-dark"
      value={svgText}
      onChange={(value) => onChange(value ?? "")}
      options={{
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        tabSize: 2,
        wordWrap: "on",
      }}
    />
  );
}
