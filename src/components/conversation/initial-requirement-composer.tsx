"use client";

import { useState } from "react";
import { Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface InitialRequirementComposerProps {
  isGenerating: boolean;
  onStart: (input: string) => void;
}

export function InitialRequirementComposer({ isGenerating, onStart }: InitialRequirementComposerProps) {
  const [input, setInput] = useState("");

  const handleStart = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onStart(trimmed);
  };

  return (
    <>
      <label className="text-sm font-semibold text-foreground">Initial Requirement</label>
      <textarea
        className="w-full h-32 p-3 border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background font-mono text-sm"
        placeholder="E.g. Create a YoMo tool to fetch current weather for a city..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={isGenerating}
      />
      <Button
        onClick={handleStart}
        disabled={isGenerating || !input.trim()}
        className="w-full py-3"
        size="lg"
      >
        {isGenerating ? (
          <><Loader2 className="animate-spin" size={18} /> Generating...</>
        ) : (
          <><Play size={18} /> Start Generating</>
        )}
      </Button>
    </>
  );
}
