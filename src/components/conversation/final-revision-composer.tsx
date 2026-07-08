"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FinalRevisionMode } from "@/types";

export interface FinalRevisionComposerProps {
  isGenerating: boolean;
  finalRevisionMode: FinalRevisionMode;
  onModeChange: (mode: FinalRevisionMode) => void;
  onSubmit: (text: string) => void;
}

export function FinalRevisionComposer({
  isGenerating,
  finalRevisionMode,
  onModeChange,
  onSubmit,
}: FinalRevisionComposerProps) {
  const [input, setInput] = useState("");

  const handleSubmit = () => {
    onSubmit(input.trim());
    setInput("");
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-semibold text-foreground">Revise Final Code</label>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onModeChange("code_only")}
          className={cn(
            "px-3 py-2 text-xs rounded-md border transition-colors",
            finalRevisionMode === "code_only"
              ? "bg-primary/5 border-primary/30 text-primary"
              : "bg-background border-border text-muted-foreground hover:bg-muted"
          )}
        >
          Code-only (Quick)
        </button>
        <button
          onClick={() => onModeChange("full_review")}
          className={cn(
            "px-3 py-2 text-xs rounded-md border transition-colors",
            finalRevisionMode === "full_review"
              ? "bg-primary/5 border-primary/30 text-primary"
              : "bg-background border-border text-muted-foreground hover:bg-muted"
          )}
        >
          Full review (Complete)
        </button>
      </div>
      <textarea
        className="w-full h-28 p-3 border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background font-mono text-sm"
        placeholder="E.g. add retries, split helper functions, adjust types..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={isGenerating}
      />
      <Button
        onClick={handleSubmit}
        disabled={isGenerating}
        className="w-full"
      >
        <Send size={16} /> {finalRevisionMode === "code_only" ? "Apply Quick Code Update" : "Start Full Revision"}
      </Button>
    </div>
  );
}
