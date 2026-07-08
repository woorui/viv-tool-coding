"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface FeedbackComposerProps {
  isGenerating: boolean;
  onContinue: () => void;
  onSend: (text: string) => void;
}

export function FeedbackComposer({ isGenerating, onContinue, onSend }: FeedbackComposerProps) {
  const [input, setInput] = useState("");

  const handleContinue = () => {
    setInput("");
    onContinue();
  };

  const handleSend = () => {
    const text = input.trim();
    onSend(text);
    setInput("");
  };

  return (
    <>
      <label className="text-sm font-semibold text-foreground">Feedback</label>
      <textarea
        className="w-full h-28 p-3 border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background font-mono text-sm"
        placeholder="E.g. change API naming, add retries..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={isGenerating}
      />
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={handleContinue}
          disabled={isGenerating}
          className="flex-1"
        >
          Continue
        </Button>
        <Button
          onClick={handleSend}
          disabled={!input.trim() || isGenerating}
          className="flex-1"
        >
          <Send size={16} /> Send
        </Button>
      </div>
    </>
  );
}
