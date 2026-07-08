"use client";

import { useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatSectionContentForDisplay,
  parseQuestionItems,
} from "@/lib/workflow-utils";
import { Button } from "@/components/ui/button";
import type { Section, QuestionItem, Stage } from "@/types";

export interface AnalysisPanelProps {
  sections: Section[];
  nonCodeSections: Section[];
  draftSection: Section | null;
  draftDisplayContent: string;
  visibleDraft: Section | null;
  isGenerating: boolean;
  stage: Stage;
  pendingQuestions: QuestionItem[];
  questionAnswers: Record<string, string>;
  onQuestionAnswerChange: (id: string, value: string) => void;
  onSubmitQuestions: () => void;
}

export function AnalysisPanel({
  nonCodeSections,
  draftSection,
  draftDisplayContent,
  visibleDraft,
  isGenerating,
  stage,
  pendingQuestions,
  questionAnswers,
  onQuestionAnswerChange,
  onSubmitQuestions,
}: AnalysisPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [nonCodeSections.length, draftSection, isGenerating]);

  return (
    <div className="xl:col-span-4 border-b xl:border-b-0 xl:border-r border-border bg-muted/30 min-h-0 flex flex-col">
      <div className="px-5 py-4 border-b border-border bg-card">
        <h2 className="text-sm font-semibold text-foreground">Questions & Analysis</h2>
      </div>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
        {nonCodeSections.map((sec, index) => {
          if (sec.name === "questions" && pendingQuestions.length > 0) {
            return (
              <div key={`${sec.name}-${index}`} className="bg-card rounded-xl shadow-sm border border-primary/20 p-4 space-y-4">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <MessageSquare className="text-primary" size={16} /> Questions
                </h3>
                {pendingQuestions.map((q) => (
                  <div key={q.id} className="p-3 bg-muted/50 border border-border rounded-lg">
                    <p className="font-medium text-sm mb-2 text-foreground">{q.question}</p>
                    <div className="flex flex-col gap-2">
                      {q.options.map((opt) => {
                        const isSelected = questionAnswers[q.id] === opt.key;
                        return (
                          <button
                            key={opt.key}
                            onClick={() => onQuestionAnswerChange(q.id, opt.key)}
                            className={cn(
                              "flex items-center gap-2 text-sm cursor-pointer px-3 py-2 rounded-md border transition-colors text-left",
                              isSelected
                                ? "border-primary/40 bg-primary/5 text-primary"
                                : "border-border bg-card text-muted-foreground hover:bg-muted"
                            )}
                          >
                            <span className={cn(
                              "flex items-center justify-center w-4 h-4 rounded-full border-2 shrink-0",
                              isSelected ? "border-primary bg-primary" : "border-border"
                            )}>
                              {isSelected && <div className="w-2 h-2 rounded-full bg-primary-foreground" />}
                            </span>
                            <span className="font-mono text-muted-foreground">{opt.key}:</span>
                            <span className="text-foreground">{opt.label}</span>
                          </button>
                        );
                      })}
                      {q.allowManual && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => onQuestionAnswerChange(q.id, "")}
                            className={cn(
                              "flex items-center justify-center w-4 h-4 rounded-full border-2 shrink-0",
                              questionAnswers[q.id] !== undefined && !q.options.find((o) => o.key === questionAnswers[q.id])
                                ? "border-primary bg-primary"
                                : "border-border"
                            )}
                          >
                            {questionAnswers[q.id] !== undefined && !q.options.find((o) => o.key === questionAnswers[q.id]) && (
                              <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                            )}
                          </button>
                          <input
                            type="text"
                            placeholder="Type custom answer..."
                            className="flex-1 p-1 text-sm border-b border-border focus:outline-none focus:border-primary bg-transparent text-foreground"
                            value={questionAnswers[q.id] !== undefined && !q.options.find((o) => o.key === questionAnswers[q.id]) ? questionAnswers[q.id] : ""}
                            onChange={(e) => onQuestionAnswerChange(q.id, e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <Button onClick={onSubmitQuestions} disabled={isGenerating} className="w-full">
                  <Send size={16} /> Submit Answers
                </Button>
              </div>
            );
          }

          const formattedContent = formatSectionContentForDisplay(sec);
          if (!formattedContent.trim()) return null;

          const isReviewFail = sec.name === "review" && sec.attrs.result === "FAIL";

          return (
            <div
              key={`${sec.name}-${index}`}
              className={cn(
                "bg-card rounded-xl shadow-sm border overflow-hidden",
                isReviewFail ? "border-rose-300" : "border-border"
              )}
            >
              <div className={cn(
                "px-4 py-2 border-b border-border text-xs font-bold uppercase tracking-wider flex justify-between",
                isReviewFail ? "bg-rose-50 text-rose-600" : "bg-muted/50 text-muted-foreground"
              )}>
                <span>{sec.name.replace("_", " ")}</span>
                {sec.name === "review" && (
                  <span className={sec.attrs.result === "PASS" ? "text-emerald-600" : "text-rose-600"}>
                    RESULT: {sec.attrs.result}
                  </span>
                )}
              </div>
              <div className="p-4 text-sm whitespace-pre-wrap text-foreground">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{formattedContent}</ReactMarkdown>
              </div>
            </div>
          );
        })}

        {visibleDraft && visibleDraft.name !== "code" && (
          <div className="bg-card rounded-xl shadow-sm border border-primary/20 overflow-hidden animate-pulse">
            <div className="px-4 py-2 border-b border-primary/10 text-xs font-bold uppercase tracking-wider flex justify-between bg-primary/5 text-primary">
              <span>{visibleDraft.name.replace("_", " ")}</span>
              <span>Generating...</span>
            </div>
            <div className="p-4 text-sm whitespace-pre-wrap text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{draftDisplayContent}</ReactMarkdown>
            </div>
          </div>
        )}

        {isGenerating && (
          <div className="bg-card rounded-xl shadow-sm border border-primary/20 px-4 py-3 text-primary text-sm flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Generating {stage.replace("_", " ")}...
          </div>
        )}

        {!isGenerating && pendingQuestions.length === 0 && nonCodeSections.length === 0 && (
          <div className="bg-card rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Questions and analysis will appear here.
          </div>
        )}
      </div>
    </div>
  );
}
