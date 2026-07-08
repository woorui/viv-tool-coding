"use client";

import { useMemo } from "react";
import { Copy, Check } from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { cn } from "@/lib/utils";
import { getCodeMirrorExtensions } from "@/lib/codemirror";

export interface CodeCardProps {
  title: string;
  path?: string;
  lang?: string;
  code: string;
  editable?: boolean;
  isEditing?: boolean;
  onToggleEdit?: () => void;
  onCodeChange?: (nextCode: string) => void;
  canReset?: boolean;
  onReset?: () => void;
  isDraft?: boolean;
  copied: boolean;
  onCopy: () => void;
}

export function CodeCard({
  title,
  path,
  lang,
  code,
  editable,
  isEditing,
  onToggleEdit,
  onCodeChange,
  canReset,
  onReset,
  isDraft,
  copied,
  onCopy,
}: CodeCardProps) {
  const editorExtensions = useMemo(() => getCodeMirrorExtensions(path, lang), [path, lang]);
  const readOnly = isDraft || !isEditing;

  return (
    <div className={cn(
      "bg-card rounded-xl shadow-sm border overflow-hidden transition-colors",
      isDraft ? "border-primary/40 animate-pulse" : "border-border"
    )}>
      <div className={cn(
        "px-4 py-2 border-b text-xs font-bold uppercase tracking-wider flex items-center justify-between",
        isDraft
          ? "border-primary/20 bg-primary/5 text-primary"
          : "border-border bg-muted/50 text-muted-foreground"
      )}>
        <span>{title}</span>
        <div className="flex items-center gap-2">
          {isDraft && <span>Generating...</span>}
          {editable && !isDraft && (
            <button
              onClick={onToggleEdit}
              className="px-2 py-1 text-[10px] rounded border border-border text-muted-foreground hover:bg-muted transition-colors"
              title={isEditing ? "Finish editing" : "Enable editing"}
            >
              {isEditing ? "Done" : "Edit"}
            </button>
          )}
          {editable && !isDraft && canReset && (
            <button
              onClick={onReset}
              className="px-2 py-1 text-[10px] rounded border border-border text-muted-foreground hover:bg-muted transition-colors"
              title="Reset to generated code"
            >
              Reset
            </button>
          )}
          <button
            onClick={onCopy}
            className="p-1.5 bg-muted hover:bg-muted/80 rounded-md transition-colors text-muted-foreground"
            title="Copy code"
          >
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      <CodeMirror
        value={code}
        height="320px"
        editable={!readOnly}
        readOnly={readOnly}
        extensions={editorExtensions}
        onChange={(value) => {
          if (readOnly) return;
          onCodeChange?.(value);
        }}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
          searchKeymap: true,
          autocompletion: !readOnly,
        }}
      />
    </div>
  );
}
