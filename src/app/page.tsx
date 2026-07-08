"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type {
  Stage,
  Section,
  QuestionItem,
  ChatMessage,
  FinalRevisionMode,
  DeployStatus,
  DeployReviewData,
} from "@/types";
import {
  parseQuestionItems,
  parseNextAction,
  decodeXmlEntities,
  parseSseEventBlock,
  parseEnvTemplateKeys,
  tryReadPackageName,
  formatSectionContentForDisplay,
} from "@/lib/workflow-utils";
import { Header } from "@/components/layout/header";
import { ConversationPanel } from "@/components/conversation/conversation-panel";
import { AnalysisPanel } from "@/components/analysis/analysis-panel";
import { CodePanel } from "@/components/code/code-panel";
import { EnvModal } from "@/components/deploy/env-modal";

export default function Page() {
  // Global State
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [engineState, setEngineState] = useState<any>(null);

  // Current Round State
  const [isGenerating, setIsGenerating] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [sections, setSections] = useState<Section[]>([]);
  const [draftSection, setDraftSection] = useState<Section | null>(null);

  // Interactive Input State
  const [isAwaitingInput, setIsAwaitingInput] = useState(true);
  const [isFinalized, setIsFinalized] = useState(false);
  const [finalRevisionMode, setFinalRevisionMode] = useState<FinalRevisionMode>("code_only");
  const [pendingQuestions, setPendingQuestions] = useState<QuestionItem[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [expandedMessages, setExpandedMessages] = useState<Record<string, boolean>>({});

  // Deploy State
  const [deployStatus, setDeployStatus] = useState<DeployStatus>("idle");
  const [deployToken, setDeployToken] = useState("");
  const [deployToolName, setDeployToolName] = useState("");
  const [deployLogs, setDeployLogs] = useState("");
  const [deployResult, setDeployResult] = useState<{ success: boolean; toolName: string } | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [envModalOpen, setEnvModalOpen] = useState(false);
  const [requiredEnvKeys, setRequiredEnvKeys] = useState<string[]>([]);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [isReviewingDeployLogs, setIsReviewingDeployLogs] = useState(false);
  const [deployReview, setDeployReview] = useState<DeployReviewData | null>(null);
  const [editedFiles, setEditedFiles] = useState<Record<string, string>>({});
  const [editingFiles, setEditingFiles] = useState<Record<string, boolean>>({});
  const lastGeneratedFilesRef = useRef<Record<string, string>>({});

  // ─── Workflow Handlers ──────────────────────────────────────────

  const handleRunRound = async (inputToRun: string, currentHistory: ChatMessage[], currentState: any) => {
    if (!inputToRun.trim()) return;

    setIsGenerating(true);
    setIsFinalized(false);
    setIsAwaitingInput(false);
    setStage("requirement_review");
    setDraftSection(null);
    setDeployStatus("idle");
    setDeployLogs("");
    setDeployResult(null);
    setDeployError(null);
    setDeployReview(null);
    setEnvModalOpen(false);
    setRequiredEnvKeys([]);
    setEnvValues({});
    setIsReviewingDeployLogs(false);
    setEditedFiles({});
    setEditingFiles({});
    lastGeneratedFilesRef.current = {};
    setSections([]);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userInput: inputToRun, history: currentHistory, state: currentState }),
      });

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => null);
        throw new Error(errorPayload?.error || `Request failed with status ${res.status}`);
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawDoneEvent = false;
      let roundSections: Section[] = [];
      let finalState = currentState;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const parsed = parseSseEventBlock(block);
          if (!parsed) continue;

          const { eventType, data } = parsed;

          if (eventType === "section_draft") {
            if (data?.name) {
              setDraftSection((prev) => {
                if (prev && prev.name === data.name && prev.content === data.content && prev.raw === data.raw) return prev;
                return data;
              });
            }
          } else if (eventType === "section") {
            roundSections.push(data);
            setSections((prev) => [...prev, data]);
            setDraftSection(null);
          } else if (eventType === "state") {
            setStage(data.stage);
          } else if (eventType === "done") {
            sawDoneEvent = true;
            finalState = data.state;
            setStage("next_action");
            setDraftSection(null);
          } else if (eventType === "error") {
            console.error(data.message);
            setDraftSection(null);
          }
        }
      }

      const trailing = parseSseEventBlock(buffer);
      if (trailing?.eventType === "done") {
        sawDoneEvent = true;
        finalState = trailing.data.state;
        setStage("next_action");
        setDraftSection(null);
      }

      if (!sawDoneEvent) console.warn("SSE stream ended without done event");

      const assistantXml = roundSections.map((s) => s.raw).join("\n");
      const updatedHistory = [
        ...currentHistory,
        { role: "user" as const, content: inputToRun },
        { role: "assistant" as const, content: assistantXml },
      ];

      setHistory(updatedHistory);
      setEngineState(finalState);

      const nextActionSection = [...roundSections].reverse().find((s) => s.name === "next_action");
      const nextAction = parseNextAction(nextActionSection?.content);

      if (nextAction === "finalize") {
        setIsFinalized(true);
        setIsAwaitingInput(true);
        setPendingQuestions([]);
        return;
      }

      const questionsSection = roundSections.find((s) => s.name === "questions");
      if (questionsSection) {
        const items = parseQuestionItems(questionsSection.content);
        if (items.length > 0) {
          setIsFinalized(false);
          setPendingQuestions(items);
          setQuestionAnswers({});
          setIsAwaitingInput(true);
          return;
        }
      }

      setIsFinalized(false);
      setPendingQuestions([]);
      setIsAwaitingInput(true);
    } catch (err) {
      console.error(err);
      setIsAwaitingInput(true);
      setDraftSection(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartFirstRound = (input: string) => handleRunRound(input, [], null);

  const handleSubmitQuestions = () => {
    const answers: string[] = [];
    for (const item of pendingQuestions) {
      const val = questionAnswers[item.id] || "";
      const selected = item.options.find((opt) => opt.key === val);
      const answerText = selected ? `${selected.key}: ${selected.label}` : val || "Not specified, proceed with the recommended approach";
      answers.push(`- ${item.id}: ${answerText}`);
    }
    handleRunRound(`User's additional answers to questions:\n${answers.join("\n")}`, history, engineState);
  };

  const handleSubmitFeedback = (type: "continue" | "feedback", feedbackText?: string) => {
    const reply = type === "continue"
      ? "Please continue in the current direction."
      : feedbackText?.trim() ? `Revision feedback: ${feedbackText}` : "Please continue the current implementation and fill in missing details.";
    handleRunRound(reply, history, engineState);
  };

  const handleSubmitFinalRevision = (feedbackText?: string) => {
    const modeInstruction = finalRevisionMode === "code_only"
      ? "Keep the current implementation strategy unchanged and only apply necessary code-level fixes; keep implementation concise and focus on updated code and review."
      : "Re-evaluate the requirements and implementation path, allow implementation strategy adjustments, and output complete implementation/code/review/next_action.";
    const baseInstruction = feedbackText?.trim()
      ? `Revision requirements: ${feedbackText}`
      : "Revision requirements: continue optimizing the final code and ensure maintainability and boundary handling.";
    setIsFinalized(false);
    handleRunRound(`Start a new revision round based on the final code. ${modeInstruction} ${baseInstruction}`, history, engineState);
  };

  // ─── Code Editing ────────────────────────────────────────────────

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  const toggleMessageExpanded = (key: string) => {
    setExpandedMessages((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggleEdit = (path: string) => setEditingFiles((prev) => ({ ...prev, [path]: !prev[path] }));
  const handleCodeChange = (path: string, code: string) => setEditedFiles((prev) => ({ ...prev, [path]: code }));
  const handleReset = (path: string) => {
    const generated = latestGeneratedFiles[path] ?? "";
    setEditedFiles((prev) => ({ ...prev, [path]: generated }));
    setEditingFiles((prev) => ({ ...prev, [path]: false }));
  };

  // ─── Deploy Handlers ─────────────────────────────────────────────

  const appendDeployLog = (text: string) => {
    const normalized = String(text || "");
    if (!normalized) return;
    setDeployLogs((prev) => prev + normalized + (normalized.endsWith("\n") ? "" : "\n"));
  };

  const runDeploy = async (envs: Record<string, string>) => {
    if (!generatedAppTs.trim() || !generatedPackageJson.trim()) {
      setDeployError("Missing src/app.ts or package.json in generated code.");
      return;
    }
    if (!deployToken.trim()) {
      setDeployError("Please provide Vivgrid token before deployment.");
      return;
    }

    const toolName = deployToolName.trim() || defaultDeployToolName;
    setDeployStatus("deploying");
    setDeployError(null);
    setDeployLogs("");
    setDeployResult(null);
    setDeployReview(null);

    try {
      const response = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-vivgrid-token": deployToken.trim() },
        body: JSON.stringify({
          toolName,
          files: {
            "src/app.ts": generatedAppTs,
            "package.json": generatedPackageJson,
            ...(generatedEnvTemplate ? { ".env.viv": generatedEnvTemplate } : {}),
          },
          envs,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Deploy request failed with status ${response.status}`);
      }
      if (!response.body) throw new Error("No deploy stream response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult = { success: false, toolName };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const parsed = parseSseEventBlock(block);
          if (!parsed) continue;
          if (parsed.eventType === "log") appendDeployLog(parsed.data?.text || "");
          else if (parsed.eventType === "error") appendDeployLog(parsed.data?.message || "Deploy failed");
          else if (parsed.eventType === "done") finalResult = { success: Boolean(parsed.data?.success), toolName: parsed.data?.toolName || toolName };
        }
      }

      const trailing = parseSseEventBlock(buffer);
      if (trailing?.eventType === "done") finalResult = { success: Boolean(trailing.data?.success), toolName: trailing.data?.toolName || toolName };

      setDeployResult(finalResult);
      setDeployStatus("done");
    } catch (error) {
      setDeployStatus("done");
      setDeployError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleClickDeploy = () => {
    setDeployError(null);
    const keys = envTemplateKeys;
    if (keys.length > 0) {
      const initialValues: Record<string, string> = {};
      for (const key of keys) initialValues[key] = envValues[key] || "";
      setRequiredEnvKeys(keys);
      setEnvValues(initialValues);
      setEnvModalOpen(true);
      setDeployStatus("collecting_env");
      return;
    }
    setDeployStatus("idle");
    runDeploy({});
  };

  const handleSubmitEnvAndDeploy = () => {
    for (const key of requiredEnvKeys) {
      if (!envValues[key]?.trim()) {
        setDeployError(`Please provide value for ${key}`);
        return;
      }
    }
    setEnvModalOpen(false);
    runDeploy(Object.fromEntries(Object.entries(envValues).map(([k, v]) => [k, v.trim()])));
  };

  const handleReviewDeployLogs = async () => {
    if (!deployLogs.trim()) { setDeployError("No deploy logs to review."); return; }
    if (!generatedAppTs.trim() || !generatedPackageJson.trim()) { setDeployError("Missing src/app.ts or package.json for deploy log review."); return; }

    setIsReviewingDeployLogs(true);
    setDeployError(null);
    setDeployReview(null);

    try {
      const response = await fetch("/api/deploy-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs: deployLogs, files: { "src/app.ts": generatedAppTs, "package.json": generatedPackageJson } }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Deploy review failed");
      setDeployReview(payload.review as DeployReviewData);
    } catch (error) {
      setDeployError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsReviewingDeployLogs(false);
    }
  };

  const handleAcceptReview = (suggestion: string) => {
    if (!deployReview) return;
    const parts: string[] = [
      `Deployment review status: ${deployReview.status}`,
      `Deployment review summary:\n${deployReview.summary}`,
    ];
    if (deployReview.reasons.length > 0) parts.push(`Deployment review reasons:\n- ${deployReview.reasons.join("\n- ")}`);
    if (deployReview.evidence.length > 0) parts.push(`Deployment review evidence:\n- ${deployReview.evidence.join("\n- ")}`);
    if (deployReview.suggestedRevisionPrompt.trim()) parts.push(`Suggested revision prompt:\n${deployReview.suggestedRevisionPrompt}`);
    if (suggestion.trim()) parts.push(`Additional user suggestions:\n${suggestion.trim()}`);
    parts.push("Please regenerate the tool code and package.json with targeted fixes based on deployment logs.");
    handleRunRound(parts.join("\n\n"), history, engineState);
  };

  const handleAbandonReview = () => setDeployReview(null);

  // ─── Derived State ───────────────────────────────────────────────

  const nonCodeSections = useMemo(() => sections.filter((s) => s.name !== "code"), [sections]);
  const codeSections = useMemo(() => sections.filter((s) => s.name === "code"), [sections]);

  const latestGeneratedFiles = useMemo(() => {
    const files: Record<string, string> = {};
    for (const section of codeSections) {
      const path = section.attrs.path;
      if (!path) continue;
      files[path] = decodeXmlEntities(section.content);
    }
    return files;
  }, [codeSections]);

  useEffect(() => {
    setEditedFiles((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [path, content] of Object.entries(latestGeneratedFiles)) {
        const previousGenerated = lastGeneratedFilesRef.current[path];
        const previousEdited = next[path];
        if (previousEdited === undefined || previousEdited === previousGenerated) {
          if (previousEdited !== content) { next[path] = content; changed = true; }
        }
      }
      return changed ? next : prev;
    });
    lastGeneratedFilesRef.current = latestGeneratedFiles;
  }, [latestGeneratedFiles]);

  const effectiveFiles = useMemo(() => ({ ...latestGeneratedFiles, ...editedFiles }), [latestGeneratedFiles, editedFiles]);
  const generatedAppTs = effectiveFiles["src/app.ts"] || "";
  const generatedPackageJson = effectiveFiles["package.json"] || "";
  const generatedEnvTemplate = effectiveFiles[".env.viv"] || "";
  const envTemplateKeys = useMemo(() => parseEnvTemplateKeys(generatedEnvTemplate), [generatedEnvTemplate]);
  const packageToolName = useMemo(() => tryReadPackageName(generatedPackageJson), [generatedPackageJson]);
  const defaultDeployToolName = packageToolName || "generated-tool";

  const hasDeployableFiles = generatedAppTs.trim().length > 0 && generatedPackageJson.trim().length > 0;
  const hasRenderedFinalCode = codeSections.some((s) => decodeXmlEntities(s.content).trim().length > 0);
  const canStartNewTool = isFinalized && hasRenderedFinalCode && !isGenerating;
  const canDeploy = isFinalized && hasDeployableFiles && !isGenerating && deployStatus !== "deploying";
  const canReviewDeployLogs = deployStatus === "done" && deployLogs.trim().length > 0 && !isReviewingDeployLogs;

  const draftDisplayContent = draftSection && draftSection.name !== "code" ? formatSectionContentForDisplay(draftSection) : "";
  const visibleDraft = draftSection && (
    draftSection.name === "code"
      ? decodeXmlEntities(draftSection.content).trim().length > 0
      : draftDisplayContent.trim().length > 0
  ) ? draftSection : null;

  useEffect(() => {
    if (!deployToolName.trim() && packageToolName) setDeployToolName(packageToolName);
  }, [deployToolName, packageToolName]);

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div className="h-screen bg-background text-foreground font-sans flex flex-col">
      <Header stage={stage} isGenerating={isGenerating} />

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12">
        <ConversationPanel
          history={history}
          isGenerating={isGenerating}
          isAwaitingInput={isAwaitingInput}
          isFinalized={isFinalized}
          finalRevisionMode={finalRevisionMode}
          pendingQuestionsLength={pendingQuestions.length}
          expandedMessages={expandedMessages}
          onToggleMessageExpanded={toggleMessageExpanded}
          onModeChange={setFinalRevisionMode}
          onStartFirstRound={handleStartFirstRound}
          onSubmitFeedback={handleSubmitFeedback}
          onSubmitFinalRevision={handleSubmitFinalRevision}
        />

        <AnalysisPanel
          sections={sections}
          nonCodeSections={nonCodeSections}
          draftSection={draftSection}
          draftDisplayContent={draftDisplayContent}
          visibleDraft={visibleDraft}
          isGenerating={isGenerating}
          stage={stage}
          pendingQuestions={pendingQuestions}
          questionAnswers={questionAnswers}
          onQuestionAnswerChange={(id, value) => setQuestionAnswers((prev) => ({ ...prev, [id]: value }))}
          onSubmitQuestions={handleSubmitQuestions}
        />

        <CodePanel
          codeSections={codeSections}
          visibleDraft={visibleDraft}
          editedFiles={editedFiles}
          editingFiles={editingFiles}
          latestGeneratedFiles={latestGeneratedFiles}
          canStartNewTool={canStartNewTool}
          isFinalized={isFinalized}
          onCopy={handleCopy}
          onToggleEdit={handleToggleEdit}
          onCodeChange={handleCodeChange}
          onReset={handleReset}
          // Deploy props
          deployStatus={deployStatus}
          deployToken={deployToken}
          deployToolName={deployToolName}
          defaultDeployToolName={defaultDeployToolName}
          deployLogs={deployLogs}
          deployResult={deployResult}
          deployError={deployError}
          deployReview={deployReview}
          isReviewingDeployLogs={isReviewingDeployLogs}
          hasDeployableFiles={hasDeployableFiles}
          canDeploy={canDeploy}
          canReviewDeployLogs={canReviewDeployLogs}
          onTokenChange={setDeployToken}
          onToolNameChange={setDeployToolName}
          onDeploy={handleClickDeploy}
          onReviewDeployLogs={handleReviewDeployLogs}
          onAcceptReview={handleAcceptReview}
          onAbandonReview={handleAbandonReview}
          onNewTool={() => window.location.reload()}
        />
      </div>

      <EnvModal
        open={envModalOpen}
        requiredEnvKeys={requiredEnvKeys}
        envValues={envValues}
        onEnvValueChange={(key, value) => setEnvValues((prev) => ({ ...prev, [key]: value }))}
        onClose={() => { setEnvModalOpen(false); setDeployStatus("idle"); }}
        onDeploy={handleSubmitEnvAndDeploy}
      />
    </div>
  );
}
