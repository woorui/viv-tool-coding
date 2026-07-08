"use client";

import { useRef, useEffect } from "react";
import { Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DeployReviewPanel } from "./deploy-review-panel";
import type { DeployStatus, DeployReviewData } from "@/types";

export interface DeploySectionProps {
  deployStatus: DeployStatus;
  deployToken: string;
  deployToolName: string;
  defaultDeployToolName: string;
  deployLogs: string;
  deployResult: { success: boolean; toolName: string } | null;
  deployError: string | null;
  deployReview: DeployReviewData | null;
  isReviewingDeployLogs: boolean;
  hasDeployableFiles: boolean;
  canDeploy: boolean;
  canReviewDeployLogs: boolean;
  onTokenChange: (value: string) => void;
  onToolNameChange: (value: string) => void;
  onDeploy: () => void;
  onReviewDeployLogs: () => void;
  onAcceptReview: (suggestion: string) => void;
  onAbandonReview: () => void;
}

export function DeploySection({
  deployStatus,
  deployToken,
  deployToolName,
  defaultDeployToolName,
  deployLogs,
  deployResult,
  deployError,
  deployReview,
  isReviewingDeployLogs,
  hasDeployableFiles,
  canDeploy,
  canReviewDeployLogs,
  onTokenChange,
  onToolNameChange,
  onDeploy,
  onReviewDeployLogs,
  onAcceptReview,
  onAbandonReview,
}: DeploySectionProps) {
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!logsRef.current) return;
    logsRef.current.scrollTo({ top: logsRef.current.scrollHeight, behavior: "smooth" });
  }, [deployLogs]);

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
      <div className="px-4 py-2 border-b border-border text-xs font-bold uppercase tracking-wider bg-muted/50 text-muted-foreground">
        Deploy
      </div>
      <div className="p-4 space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Vivgrid Token</label>
          <input
            type="password"
            value={deployToken}
            onChange={(e) => onTokenChange(e.target.value)}
            placeholder="Enter deploy token"
            className="w-full px-3 py-2 border border-border rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring bg-background"
            disabled={deployStatus === "deploying"}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Tool Name</label>
          <input
            type="text"
            value={deployToolName}
            onChange={(e) => onToolNameChange(e.target.value)}
            placeholder={defaultDeployToolName}
            className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
            disabled={deployStatus === "deploying"}
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={onDeploy}
            disabled={!canDeploy}
            className="flex-1"
          >
            {deployStatus === "deploying" ? (
              <><Loader2 size={16} className="animate-spin" /> Deploying...</>
            ) : (
              <><Play size={16} /> Deploy</>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={onReviewDeployLogs}
            disabled={!canReviewDeployLogs}
            className="flex-1"
          >
            {isReviewingDeployLogs ? "Reviewing..." : "AI Review Logs"}
          </Button>
        </div>

        {!hasDeployableFiles && (
          <p className="text-xs text-muted-foreground">
            Deployment requires generated <code className="text-foreground">src/app.ts</code> and <code className="text-foreground">package.json</code>.
          </p>
        )}

        {deployError && (
          <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 whitespace-pre-wrap">
            {deployError}
          </div>
        )}

        <div ref={logsRef} className="bg-slate-900 text-slate-100 rounded-md p-3 h-56 overflow-y-auto text-xs font-mono whitespace-pre-wrap">
          {deployLogs.trim().length > 0 ? deployLogs : "Deploy logs will appear here."}
        </div>

        {deployResult && (
          <p className={cn("text-sm", deployResult.success ? "text-emerald-700" : "text-amber-700")}>
            {deployResult.success
              ? `Deployment completed for ${deployResult.toolName}.`
              : `Deployment finished with errors for ${deployResult.toolName}.`}
          </p>
        )}

        {deployReview && (
          <DeployReviewPanel
            review={deployReview}
            onAccept={onAcceptReview}
            onAbandon={onAbandonReview}
          />
        )}
      </div>
    </div>
  );
}
