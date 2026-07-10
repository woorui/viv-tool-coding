"use client";

import { useRef, useState } from "react";
import { Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface InitialRequirementComposerProps {
  isGenerating: boolean;
  onStart: (input: string) => void;
}

export function InitialRequirementComposer({ isGenerating, onStart }: InitialRequirementComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const [hasInput, setHasInput] = useState(false);

  const handleStart = () => {
    const trimmed = textareaRef.current?.value.trim() || "";
    if (!trimmed) return;
    onStart(trimmed);
  };

  const updateHasInput = (value: string) => {
    setHasInput(/\S/.test(value));
  };

  return (
    <>
      <label className="text-sm font-semibold text-foreground">Initial Requirement</label>
      <textarea
        ref={textareaRef}
        className="w-full h-32 p-3 border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background font-mono text-sm"
        placeholder="E.g. Create a YoMo tool to fetch current weather for a city..."
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          updateHasInput(e.currentTarget.value);
        }}
        onChange={(e) => {
          if (composingRef.current) return;
          updateHasInput(e.currentTarget.value);
        }}
        disabled={isGenerating}
      />
      <Button
        onClick={handleStart}
        disabled={isGenerating || !hasInput}
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
