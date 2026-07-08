"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDeployReviewStatusView } from "@/lib/workflow-utils";
import type { DeployReviewData } from "@/types";

export interface DeployReviewPanelProps {
  review: DeployReviewData;
  onAccept: (suggestion: string) => void;
  onAbandon: () => void;
}

export function DeployReviewPanel({ review, onAccept, onAbandon }: DeployReviewPanelProps) {
  const [isAccepting, setIsAccepting] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const hasCodeFixSuggestion = review.suggestedRevisionPrompt.trim().length > 0;
  const statusView = getDeployReviewStatusView(review.status);

  return (
    <div className={`border rounded-lg p-3 space-y-3 ${statusView.panelClassName}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Deploy Log Review</p>
        <Badge variant="outline" className={statusView.badgeClassName}>
          {statusView.icon}
          {statusView.label}
        </Badge>
      </div>

      <div className="bg-card border border-border rounded-md p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Summary</p>
        <p className="text-sm text-foreground whitespace-pre-wrap mt-1">{review.summary}</p>
        {review.reviewStage && (
          <p className="text-xs text-muted-foreground mt-2">Target Stage: {review.reviewStage}</p>
        )}
      </div>

      {review.reasons.length > 0 && (
        <div className="text-sm text-foreground bg-card border border-border rounded-md p-3">
          <p className="font-medium text-foreground">Reasons</p>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            {review.reasons.map((reason, index) => (
              <li key={`${reason}-${index}`}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {review.evidence.length > 0 && (
        <div className="text-sm text-foreground bg-card border border-border rounded-md p-3">
          <p className="font-medium text-foreground">Evidence</p>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            {review.evidence.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-sm text-foreground whitespace-pre-wrap bg-card border border-border rounded-md p-3">
        <p className="font-medium text-foreground">Suggested Prompt</p>
        <p className="mt-1">{review.suggestedRevisionPrompt || "No code regeneration prompt provided."}</p>
      </div>

      {isAccepting && hasCodeFixSuggestion && (
        <div className="space-y-2">
          <textarea
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            placeholder="Optional: add your own suggestion before regenerating"
            className="w-full h-24 p-2 border border-border rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background"
          />
          <div className="flex gap-2">
            <Button
              onClick={() => {
                onAccept(suggestion);
                setIsAccepting(false);
                setSuggestion("");
              }}
              className="flex-1"
            >
              Confirm Regenerate
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setIsAccepting(false);
                setSuggestion("");
              }}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!isAccepting && hasCodeFixSuggestion && (
        <div className="flex gap-2">
          <Button onClick={() => setIsAccepting(true)} className="flex-1">
            Accept and Regenerate
          </Button>
          <Button variant="outline" onClick={onAbandon} className="flex-1">
            Abandon
          </Button>
        </div>
      )}

      {!hasCodeFixSuggestion && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={onAbandon} className="w-full">
            Close
          </Button>
        </div>
      )}
    </div>
  );
}
