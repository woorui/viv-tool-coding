"use client";

import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeCard } from "./code-card";
import { DeploySection } from "@/components/deploy/deploy-section";
import { decodeXmlEntities } from "@/lib/workflow-utils";
import type { Section, DeployStatus, DeployReviewData } from "@/types";

export interface CodePanelProps {
  codeSections: Section[];
  visibleDraft: Section | null;
  editedFiles: Record<string, string>;
  editingFiles: Record<string, boolean>;
  latestGeneratedFiles: Record<string, string>;
  copied: boolean;
  canStartNewTool: boolean;
  isFinalized: boolean;
  // Deploy props
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
  // Callbacks
  onCopy: (code: string) => void;
  onToggleEdit: (path: string) => void;
  onCodeChange: (path: string, code: string) => void;
  onReset: (path: string) => void;
  onTokenChange: (value: string) => void;
  onToolNameChange: (value: string) => void;
  onDeploy: () => void;
  onReviewDeployLogs: () => void;
  onAcceptReview: (suggestion: string) => void;
  onAbandonReview: () => void;
  onNewTool: () => void;
}

export function CodePanel({
  codeSections,
  visibleDraft,
  editedFiles,
  editingFiles,
  latestGeneratedFiles,
  copied,
  canStartNewTool,
  isFinalized,
  ...deployProps
}: CodePanelProps) {
  return (
    <div className="xl:col-span-5 bg-muted/30 min-h-0 flex flex-col">
      <div className="px-5 py-4 border-b border-border bg-card flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Generated Code</h2>
        {canStartNewTool ? (
          <Button size="sm" onClick={deployProps.onNewTool} className="bg-emerald-600 hover:bg-emerald-700">
            <CheckCircle2 size={14} /> Start New Tool
          </Button>
        ) : isFinalized ? (
          <span className="text-xs text-muted-foreground">Waiting for final code render...</span>
        ) : null}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
        {codeSections.map((sec, index) => {
          const path = sec.attrs.path;
          const code = path ? (editedFiles[path] ?? decodeXmlEntities(sec.content)) : decodeXmlEntities(sec.content);
          const generatedCode = path ? (latestGeneratedFiles[path] ?? decodeXmlEntities(sec.content)) : decodeXmlEntities(sec.content);
          if (!code.trim()) return null;
          const pathLabel = path || "code";
          const langLabel = sec.attrs.lang || "ts";
          const isEditing = path ? Boolean(editingFiles[path]) : false;

          return (
            <CodeCard
              key={`code-${index}`}
              title={`${pathLabel} (${langLabel})`}
              path={pathLabel}
              lang={langLabel}
              code={code}
              editable={Boolean(path)}
              isEditing={isEditing}
              onToggleEdit={path ? () => deployProps.onToggleEdit(path) : undefined}
              onCodeChange={path ? (nextCode) => deployProps.onCodeChange(path, nextCode) : undefined}
              canReset={Boolean(path) && code !== generatedCode}
              onReset={path ? () => deployProps.onReset(path) : undefined}
              copied={copied}
              onCopy={() => deployProps.onCopy(code)}
            />
          );
        })}

        {visibleDraft && visibleDraft.name === "code" && (
          <CodeCard
            title={`${visibleDraft.attrs.path || "code"} (${visibleDraft.attrs.lang || "ts"})`}
            path={visibleDraft.attrs.path || "code"}
            lang={visibleDraft.attrs.lang || "ts"}
            code={decodeXmlEntities(visibleDraft.content)}
            isDraft
            copied={copied}
            onCopy={() => deployProps.onCopy(decodeXmlEntities(visibleDraft.content))}
          />
        )}

        {codeSections.length === 0 && (!visibleDraft || visibleDraft.name !== "code") && (
          <div className="bg-card rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Generated TypeScript code will appear here.
          </div>
        )}

        <DeploySection {...deployProps} />
      </div>
    </div>
  );
}
