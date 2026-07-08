import { javascript } from "@codemirror/lang-javascript";
import { json as jsonLanguage } from "@codemirror/lang-json";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { EditorView } from "@codemirror/view";

export function getCodeMirrorExtensions(path?: string, lang?: string) {
  const normalizedPath = (path || "").toLowerCase();
  const normalizedLang = (lang || "").toLowerCase();

  if (normalizedPath.endsWith(".json") || normalizedLang === "json") {
    return [jsonLanguage(), EditorView.lineWrapping];
  }

  if (normalizedPath.endsWith(".env") || normalizedPath.endsWith(".env.viv")) {
    return [StreamLanguage.define(shell), EditorView.lineWrapping];
  }

  if (normalizedPath.endsWith(".js") || normalizedPath.endsWith(".jsx")) {
    return [javascript({ jsx: normalizedPath.endsWith(".jsx") }), EditorView.lineWrapping];
  }

  if (normalizedPath.endsWith(".ts") || normalizedPath.endsWith(".tsx") || normalizedLang === "typescript") {
    return [javascript({ typescript: true, jsx: normalizedPath.endsWith(".tsx") }), EditorView.lineWrapping];
  }

  return [EditorView.lineWrapping];
}
