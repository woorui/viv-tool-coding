"use client";

import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { formatHistoryMessageForDisplay } from "@/lib/workflow-utils";
import { InitialRequirementComposer } from "./initial-requirement-composer";
import { FeedbackComposer } from "./feedback-composer";
import { FinalRevisionComposer } from "./final-revision-composer";
import type { ChatMessage, FinalRevisionMode } from "@/types";

export interface ConversationPanelProps {
  history: ChatMessage[];
  isGenerating: boolean;
  isAwaitingInput: boolean;
  isFinalized: boolean;
  finalRevisionMode: FinalRevisionMode;
  pendingQuestionsLength: number;
  expandedMessages: Record<string, boolean>;
  onToggleMessageExpanded: (key: string) => void;
  onModeChange: (mode: FinalRevisionMode) => void;
  onStartFirstRound: (input: string) => void;
  onSubmitFeedback: (type: "continue" | "feedback", text?: string) => void;
  onSubmitFinalRevision: (text: string) => void;
}

export function ConversationPanel({
  history,
  isGenerating,
  isAwaitingInput,
  isFinalized,
  finalRevisionMode,
  pendingQuestionsLength,
  expandedMessages,
  onToggleMessageExpanded,
  onModeChange,
  onStartFirstRound,
  onSubmitFeedback,
  onSubmitFinalRevision,
}: ConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history.length]);

  return (
    <div className="xl:col-span-3 border-b xl:border-b-0 xl:border-r border-border bg-card min-h-0 flex flex-col">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Conversation</h2>
      </div>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Start by entering your tool requirement.</p>
        ) : (
          history.map((msg, index) => {
            const messageKey = `${msg.role}-${index}`;
            const displayText = formatHistoryMessageForDisplay(msg);
            const isExpanded = Boolean(expandedMessages[messageKey]);
            const canExpand = displayText.length > 0;

            return (
              <div
                key={messageKey}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm min-h-24 flex flex-col",
                  msg.role === "user"
                    ? "bg-primary/5 border border-primary/10"
                    : "bg-muted border border-border"
                )}
              >
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{msg.role}</p>
                <p
                  className="whitespace-pre-wrap text-foreground"
                  style={
                    isExpanded
                      ? undefined
                      : {
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }
                  }
                >
                  {displayText}
                </p>
                {canExpand && (
                  <button
                    onClick={() => onToggleMessageExpanded(messageKey)}
                    className="mt-2 self-end text-xs text-primary hover:text-primary/80 font-medium"
                  >
                    {isExpanded ? "Collapse" : "View Full"}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
      <div className="border-t border-border p-5 space-y-3">
        {history.length === 0 ? (
          <InitialRequirementComposer isGenerating={isGenerating} onStart={onStartFirstRound} />
        ) : !isAwaitingInput ? (
          <div className="flex flex-col items-center text-center gap-3 py-3 text-emerald-600">
            <p className="text-sm font-semibold">Workflow completed.</p>
          </div>
        ) : isFinalized ? (
          <FinalRevisionComposer
            isGenerating={isGenerating}
            finalRevisionMode={finalRevisionMode}
            onModeChange={onModeChange}
            onSubmit={onSubmitFinalRevision}
          />
        ) : pendingQuestionsLength > 0 ? (
          <p className="text-sm text-muted-foreground">Please answer the pending questions in the middle panel.</p>
        ) : (
          <FeedbackComposer
            isGenerating={isGenerating}
            onContinue={() => onSubmitFeedback("continue")}
            onSend={(text) => onSubmitFeedback("feedback", text)}
          />
        )}
      </div>
    </div>
  );
}
