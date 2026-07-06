"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Copy, Check, Loader2, Play, Code, FileText, CheckCircle2, MessageSquare, Send, AlertTriangle, CircleCheckBig, HelpCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { json as jsonLanguage } from "@codemirror/lang-json";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { EditorView } from "@codemirror/view";

type Stage =
  | "idle"
  | "requirement_review"
  | "questions"
  | "implementation"
  | "code"
  | "review"
  | "next_action";

interface Section {
  name: string;
  content: string;
  attrs: Record<string, string>;
  raw: string;
}

interface QuestionItem {
  id: string;
  question: string;
  options: { key: string; label: string }[];
  allowManual: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type NextActionValue = "ask_user" | "revise_code" | "finalize";
type FinalRevisionMode = "code_only" | "full_review";
type DeployStatus = "idle" | "collecting_env" | "deploying" | "done";

interface DeployReviewData {
  status: "success" | "failed" | "inconclusive";
  reviewStage: "build typescript" | "generate llm_tool.json" | null;
  summary: string;
  reasons: string[];
  evidence: string[];
  suggestedRevisionPrompt: string;
}

const STAGES: { id: Stage; label: string; icon: React.ReactNode }[] = [
  { id: "requirement_review", label: "Requirement Review", icon: <FileText size={16} /> },
  { id: "questions", label: "Questions", icon: <MessageSquare size={16} /> },
  { id: "implementation", label: "Implementation Plan", icon: <FileText size={16} /> },
  { id: "code", label: "Generating Code", icon: <Code size={16} /> },
  { id: "review", label: "Review", icon: <CheckCircle2 size={16} /> },
  { id: "next_action", label: "Done", icon: <Check size={16} /> },
];

function normalizeText(inputText: string) {
  return inputText.replace(/\s+/g, " ").trim();
}

function parseQuestionItems(xmlContent: string): QuestionItem[] {
  const items: QuestionItem[] = [];
  const itemPattern = /<item\b([^>]*)>([\s\S]*?)<\/item>/g;
  let itemMatch;

  while ((itemMatch = itemPattern.exec(xmlContent)) !== null) {
    const attrs = itemMatch[1] || "";
    const body = itemMatch[2] || "";
    const idMatch = /\bid\s*=\s*"([^"]+)"/.exec(attrs);
    const questionMatch = /<question>([\s\S]*?)<\/question>/.exec(body);
    const allowManual = /<allow_manual>\s*true\s*<\/allow_manual>/.test(body);

    const options: { key: string; label: string }[] = [];
    const optionPattern = /<option\b([^>]*)>([\s\S]*?)<\/option>/g;
    let optionMatch;
    while ((optionMatch = optionPattern.exec(body)) !== null) {
      const optionAttrs = optionMatch[1] || "";
      const keyMatch = /\bkey\s*=\s*"([^"]+)"/.exec(optionAttrs);
      options.push({
        key: keyMatch?.[1] ?? String(options.length + 1),
        label: normalizeText(optionMatch[2] || ""),
      });
    }

    items.push({
      id: idMatch?.[1] ?? `q${items.length + 1}`,
      question: normalizeText(questionMatch?.[1] || ""),
      options,
      allowManual,
    });
  }

  return items;
}

function parseNextAction(rawContent?: string): NextActionValue | null {
  if (!rawContent) return null;
  const matched = rawContent.toLowerCase().match(/ask_user|revise_code|finalize/);
  if (!matched) return null;
  return matched[0] as NextActionValue;
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, value: string) => String.fromCodePoint(parseInt(value, 16)));
}

function stripXmlTagsToReadableText(input: string): string {
  const decoded = decodeXmlEntities(input || "");
  const withoutComments = decoded.replace(/<!--[\s\S]*?-->/g, "");
  const withoutTags = withoutComments.replace(/<[^>]+>/g, "\n");
  return withoutTags
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n\n");
}

function extractXmlTagContent(xml: string, tagName: string): string {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const matched = pattern.exec(xml);
  if (!matched) return "";
  return stripXmlTagsToReadableText(matched[1]);
}

function formatQuestionsDisplay(xmlContent: string): string {
  const items = parseQuestionItems(xmlContent);
  if (items.length === 0) {
    return stripXmlTagsToReadableText(xmlContent);
  }

  return items
    .map((item, index) => {
      const lines = [`${index + 1}. ${item.question || "(No question text provided)"}`];
      const validOptions = item.options.filter((option) => option.label.trim().length > 0);
      for (const option of validOptions) {
        lines.push(`   - ${option.key}: ${option.label}`);
      }
      if (item.allowManual) {
        lines.push("   - Manual input supported");
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

function formatReviewDisplay(content: string): string {
  const blocks: Array<{ title: string; value: string }> = [
    { title: "Failed Checks", value: extractXmlTagContent(content, "failed_checks") },
    { title: "Reasons", value: extractXmlTagContent(content, "reasons") },
    { title: "Fix Instructions", value: extractXmlTagContent(content, "fix_instructions") },
  ].filter((block) => block.value.trim().length > 0);

  if (blocks.length === 0) {
    return stripXmlTagsToReadableText(content);
  }

  return blocks
    .map((block) => `**${block.title}**\n${block.value}`)
    .join("\n\n");
}

function formatSectionContentForDisplay(section: Pick<Section, "name" | "content">): string {
  if (section.name === "questions") {
    return formatQuestionsDisplay(section.content);
  }

  if (section.name === "review") {
    return formatReviewDisplay(section.content);
  }

  if (section.name === "next_action") {
    const action = parseNextAction(section.content);
    if (!action) return "";
    if (action === "ask_user") return "User input is required";
    if (action === "revise_code") return "Continue revising the code";
    return "Workflow completed";
  }

  return stripXmlTagsToReadableText(section.content);
}

function formatHistoryMessageForDisplay(message: ChatMessage): string {
  const base = message.role === "assistant"
    ? stripXmlTagsToReadableText(message.content)
    : message.content.trim();

  if (!base) return message.role === "assistant" ? "(No displayable content in this round)" : "(Empty message)";
  return base;
}

function getCodeMirrorExtensions(path?: string, lang?: string) {
  const normalizedPath = (path || "").toLowerCase();
  const normalizedLang = (lang || "").toLowerCase();

  if (normalizedPath.endsWith(".json") || normalizedLang === "json") {
    return [jsonLanguage(), EditorView.lineWrapping];
  }

  if (normalizedPath.endsWith(".env") || normalizedPath.endsWith(".env.viv")) {
    return [StreamLanguage.define(shell), EditorView.lineWrapping];
  }

  if (normalizedPath.endsWith(".js") || normalizedPath.endsWith(".jsx")) {
    return [javascript({ jsx: normalizedPath.endsWith(".jsx") }), EditorView.lineWrapping];
  }

  if (normalizedPath.endsWith(".ts") || normalizedPath.endsWith(".tsx") || normalizedLang === "typescript") {
    return [javascript({ typescript: true, jsx: normalizedPath.endsWith(".tsx") }), EditorView.lineWrapping];
  }

  return [EditorView.lineWrapping];
}

function CodeCard({
  title,
  path,
  lang,
  code,
  editable,
  isEditing,
  onToggleEdit,
  onCodeChange,
  canReset,
  onReset,
  isDraft,
  copied,
  onCopy,
}: {
  title: string;
  path?: string;
  lang?: string;
  code: string;
  editable?: boolean;
  isEditing?: boolean;
  onToggleEdit?: () => void;
  onCodeChange?: (nextCode: string) => void;
  canReset?: boolean;
  onReset?: () => void;
  isDraft?: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  const editorExtensions = useMemo(() => getCodeMirrorExtensions(path, lang), [path, lang]);
  const readOnly = isDraft || !isEditing;

  return (
    <div className={`bg-white rounded-xl shadow-sm border overflow-hidden ${isDraft ? "border-blue-200 animate-pulse" : "border-gray-200"}`}>
      <div className={`px-4 py-2 border-b text-xs font-bold uppercase tracking-wider flex items-center justify-between ${isDraft ? "border-blue-100 bg-blue-50 text-blue-600" : "border-gray-100 text-gray-500"}`}>
        <span>{title}</span>
        <div className="flex items-center gap-2">
          {isDraft && <span>Generating...</span>}
          {editable && !isDraft && (
            <button
              onClick={onToggleEdit}
              className="px-2 py-1 text-[10px] rounded border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
              title={isEditing ? "Finish editing" : "Enable editing"}
            >
              {isEditing ? "Done" : "Edit"}
            </button>
          )}
          {editable && !isDraft && canReset && (
            <button
              onClick={onReset}
              className="px-2 py-1 text-[10px] rounded border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
              title="Reset to generated code"
            >
              Reset
            </button>
          )}
          <button
            onClick={onCopy}
            className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-gray-600"
            title="Copy code"
          >
            {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      <CodeMirror
        value={code}
        height="320px"
        editable={!readOnly}
        readOnly={readOnly}
        extensions={editorExtensions}
        onChange={(value) => {
          if (readOnly) return;
          onCodeChange?.(value);
        }}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
          searchKeymap: true,
          autocompletion: !readOnly,
        }}
      />
    </div>
  );
}

function InitialRequirementComposer({
  isGenerating,
  onStart,
}: {
  isGenerating: boolean;
  onStart: (input: string) => void;
}) {
  const [input, setInput] = useState("");

  const handleStart = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onStart(trimmed);
  };

  return (
    <>
      <label className="text-sm font-semibold text-gray-700">Initial Requirement</label>
      <textarea
        className="w-full h-32 p-3 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        placeholder="E.g. Create a YoMo tool to fetch current weather for a city..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={isGenerating}
      />
      <button
        onClick={handleStart}
        disabled={isGenerating || !input.trim()}
        className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg font-medium transition-colors"
      >
        {isGenerating ? (
          <><Loader2 className="animate-spin" size={18} /> Generating...</>
        ) : (
          <><Play size={18} /> Start Generating</>
        )}
      </button>
    </>
  );
}

function FeedbackComposer({
  isGenerating,
  onContinue,
  onSend,
}: {
  isGenerating: boolean;
  onContinue: () => void;
  onSend: (text: string) => void;
}) {
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
      <label className="text-sm font-semibold text-gray-700">Feedback</label>
      <textarea
        className="w-full h-28 p-3 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        placeholder="E.g. change API naming, add retries..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={isGenerating}
      />
      <div className="flex gap-2">
        <button
          onClick={handleContinue}
          disabled={isGenerating}
          className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors border border-gray-300 disabled:opacity-50"
        >
          Continue
        </button>
        <button
          onClick={handleSend}
          disabled={!input.trim() || isGenerating}
          className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg font-medium transition-colors"
        >
          <Send size={16} /> Send
        </button>
      </div>
    </>
  );
}

function FinalRevisionComposer({
  isGenerating,
  finalRevisionMode,
  onModeChange,
  onSubmit,
}: {
  isGenerating: boolean;
  finalRevisionMode: FinalRevisionMode;
  onModeChange: (mode: FinalRevisionMode) => void;
  onSubmit: (text: string) => void;
}) {
  const [input, setInput] = useState("");

  const handleSubmit = () => {
    onSubmit(input.trim());
    setInput("");
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-semibold text-gray-700">Revise Final Code</label>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onModeChange("code_only")}
          className={`px-3 py-2 text-xs rounded-md border transition-colors ${
            finalRevisionMode === "code_only"
              ? "bg-blue-50 border-blue-300 text-blue-700"
              : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Code-only (Quick)
        </button>
        <button
          onClick={() => onModeChange("full_review")}
          className={`px-3 py-2 text-xs rounded-md border transition-colors ${
            finalRevisionMode === "full_review"
              ? "bg-blue-50 border-blue-300 text-blue-700"
              : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Full review (Complete)
        </button>
      </div>
      <textarea
        className="w-full h-28 p-3 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        placeholder="E.g. add retries, split helper functions, adjust types..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={isGenerating}
      />
      <button
        onClick={handleSubmit}
        disabled={isGenerating}
        className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg font-medium transition-colors"
      >
        <Send size={16} /> {finalRevisionMode === "code_only" ? "Apply Quick Code Update" : "Start Full Revision"}
      </button>
    </div>
  );
}

function parseSseEventBlock(block: string): { eventType: string; data: any } | null {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  const eventLine = lines.find((line) => line.startsWith("event:"));
  const dataLines = lines.filter((line) => line.startsWith("data:"));
  if (!eventLine || dataLines.length === 0) return null;

  const eventType = eventLine.slice("event:".length).trim();
  const dataText = dataLines.map((line) => line.slice("data:".length).trim()).join("\n");

  try {
    return { eventType, data: JSON.parse(dataText) };
  } catch {
    return null;
  }
}

function parseEnvTemplateKeys(envTemplate: string): string[] {
  const keys = new Set<string>();
  const lines = envTemplate.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalIndex = line.indexOf("=");
    if (equalIndex <= 0) continue;
    const key = line.slice(0, equalIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    keys.add(key);
  }
  return Array.from(keys);
}

function tryReadPackageName(packageJsonContent: string): string {
  try {
    const parsed = JSON.parse(packageJsonContent);
    return typeof parsed?.name === "string" ? parsed.name : "";
  } catch {
    return "";
  }
}

function getDeployReviewStatusView(status: DeployReviewData["status"]): {
  label: string;
  icon: React.ReactNode;
  badgeClassName: string;
  panelClassName: string;
} {
  if (status === "success") {
    return {
      label: "Success",
      icon: <CircleCheckBig size={14} />,
      badgeClassName: "bg-emerald-50 text-emerald-700 border-emerald-200",
      panelClassName: "bg-emerald-50/40 border-emerald-200",
    };
  }

  if (status === "failed") {
    return {
      label: "Failed",
      icon: <AlertTriangle size={14} />,
      badgeClassName: "bg-rose-50 text-rose-700 border-rose-200",
      panelClassName: "bg-rose-50/40 border-rose-200",
    };
  }

  return {
    label: "Inconclusive",
    icon: <HelpCircle size={14} />,
    badgeClassName: "bg-amber-50 text-amber-700 border-amber-200",
    panelClassName: "bg-amber-50/40 border-amber-200",
  };
}

export default function Page() {
  // Global State
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [engineState, setEngineState] = useState<any>(null);
  
  // Current Round State
  const [isGenerating, setIsGenerating] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [streamText, setStreamText] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [draftSection, setDraftSection] = useState<Section | null>(null);
  
  // Interactive Input State
  const [isAwaitingInput, setIsAwaitingInput] = useState(true);
  const [isFinalized, setIsFinalized] = useState(false);
  const [finalRevisionMode, setFinalRevisionMode] = useState<FinalRevisionMode>("code_only");
  const [pendingQuestions, setPendingQuestions] = useState<QuestionItem[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [expandedMessages, setExpandedMessages] = useState<Record<string, boolean>>({});
  
  // UI State
  const [copied, setCopied] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const deployLogsContainerRef = useRef<HTMLDivElement>(null);

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
  const [isAcceptingReview, setIsAcceptingReview] = useState(false);
  const [acceptReviewSuggestion, setAcceptReviewSuggestion] = useState("");
  const [editedFiles, setEditedFiles] = useState<Record<string, string>>({});
  const [editingFiles, setEditingFiles] = useState<Record<string, boolean>>({});
  const lastGeneratedFilesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamText, sections, history]);

  useEffect(() => {
    if (!deployLogsContainerRef.current) return;
    deployLogsContainerRef.current.scrollTo({
      top: deployLogsContainerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [deployLogs]);

  const handleRunRound = async (inputToRun: string, currentHistory: ChatMessage[], currentState: any) => {
    if (!inputToRun.trim()) return;

    setIsGenerating(true);
    setIsFinalized(false);
    setIsAwaitingInput(false);
    setStage("requirement_review");
    setStreamText("");
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
    setIsAcceptingReview(false);
    setAcceptReviewSuggestion("");
    setEditedFiles({});
    setEditingFiles({});
    lastGeneratedFilesRef.current = {};
    
    // Keep past sections in view by not clearing them, or we can just append to history and show sections of current round
    setSections([]);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userInput: inputToRun, 
          history: currentHistory,
          state: currentState
        }),
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

          if (eventType === "chunk") {
            setStreamText((prev) => prev + (data.text || ""));
          } else if (eventType === "state") {
            setStage(data.stage);
          } else if (eventType === "section_draft") {
            if (data?.name) {
              setDraftSection((prev) => {
                if (
                  prev &&
                  prev.name === data.name &&
                  prev.content === data.content &&
                  prev.raw === data.raw
                ) {
                  return prev;
                }
                return data;
              });
            }
          } else if (eventType === "section") {
            roundSections.push(data);
            setSections((prev) => [...prev, data]);
            setDraftSection(null);
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

      if (!sawDoneEvent) {
        console.warn("SSE stream ended without done event");
      }

      // Round Finished. Update History and Determine Next Input
      const assistantXml = roundSections.map((s) => s.raw).join("\n");
      const updatedHistory = [
        ...currentHistory,
        { role: "user" as const, content: inputToRun },
        { role: "assistant" as const, content: assistantXml }
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

      const questionsSection = roundSections.find(s => s.name === "questions");
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

      // Otherwise we need manual feedback
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

  const handleStartFirstRound = (input: string) => {
    handleRunRound(input, [], null);
  };

  const handleSubmitQuestions = () => {
    const answers: string[] = [];
    for (const item of pendingQuestions) {
      const val = questionAnswers[item.id] || "";
      const selected = item.options.find(opt => opt.key === val);
      const answerText = selected ? `${selected.key}: ${selected.label}` : (val || "Not specified, proceed with the recommended approach");
      answers.push(`- ${item.id}: ${answerText}`);
    }
    const formattedReply = `User's additional answers to questions:\n${answers.join("\n")}`;
    handleRunRound(formattedReply, history, engineState);
  };

  const handleSubmitFeedback = (type: "continue" | "feedback", feedbackText?: string) => {
    let reply = "";
    if (type === "continue") {
      reply = "Please continue in the current direction.";
    } else {
      reply = feedbackText?.trim() ? `Revision feedback: ${feedbackText}` : "Please continue the current implementation and fill in missing details.";
    }
    handleRunRound(reply, history, engineState);
  };

  const handleSubmitFinalRevision = (feedbackText?: string) => {
    const modeInstruction = finalRevisionMode === "code_only"
      ? "Keep the current implementation strategy unchanged and only apply necessary code-level fixes; keep implementation concise and focus on updated code and review."
      : "Re-evaluate the requirements and implementation path, allow implementation strategy adjustments, and output complete implementation/code/review/next_action.";
    const baseInstruction = feedbackText?.trim()
      ? `Revision requirements: ${feedbackText}`
      : "Revision requirements: continue optimizing the final code and ensure maintainability and boundary handling.";
    const reply = `Start a new revision round based on the final code. ${modeInstruction} ${baseInstruction}`;
    setIsFinalized(false);
    handleRunRound(reply, history, engineState);
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleMessageExpanded = (messageKey: string) => {
    setExpandedMessages((prev) => ({
      ...prev,
      [messageKey]: !prev[messageKey],
    }));
  };

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
    setIsAcceptingReview(false);
    setAcceptReviewSuggestion("");

    try {
      const response = await fetch("/api/deploy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vivgrid-token": deployToken.trim(),
        },
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
      if (!response.body) {
        throw new Error("No deploy stream response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalDone = false;
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

          if (parsed.eventType === "log") {
            appendDeployLog(parsed.data?.text || "");
          } else if (parsed.eventType === "error") {
            appendDeployLog(parsed.data?.message || "Deploy failed");
          } else if (parsed.eventType === "done") {
            finalDone = true;
            finalResult = {
              success: Boolean(parsed.data?.success),
              toolName: parsed.data?.toolName || toolName,
            };
          }
        }
      }

      const trailing = parseSseEventBlock(buffer);
      if (trailing?.eventType === "done") {
        finalDone = true;
        finalResult = {
          success: Boolean(trailing.data?.success),
          toolName: trailing.data?.toolName || toolName,
        };
      }

      if (!finalDone) {
        throw new Error("Deploy stream ended without done event");
      }

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
      for (const key of keys) {
        initialValues[key] = envValues[key] || "";
      }
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
    runDeploy(
      Object.fromEntries(
        Object.entries(envValues).map(([key, value]) => [key, value.trim()]),
      ),
    );
  };

  const handleReviewDeployLogs = async () => {
    if (!deployLogs.trim()) {
      setDeployError("No deploy logs to review.");
      return;
    }

    if (!generatedAppTs.trim() || !generatedPackageJson.trim()) {
      setDeployError("Missing src/app.ts or package.json for deploy log review.");
      return;
    }

    setIsReviewingDeployLogs(true);
    setDeployError(null);
    setDeployReview(null);
    setIsAcceptingReview(false);
    setAcceptReviewSuggestion("");

    try {
      const response = await fetch("/api/deploy-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logs: deployLogs,
          files: {
            "src/app.ts": generatedAppTs,
            "package.json": generatedPackageJson,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Deploy review failed");
      }
      setDeployReview(payload.review as DeployReviewData);
    } catch (error) {
      setDeployError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsReviewingDeployLogs(false);
    }
  };

  const handleConfirmAcceptAndRegenerate = () => {
    if (!deployReview) {
      return;
    }

    const parts: string[] = [
      `Deployment review status: ${deployReview.status}`,
      `Deployment review summary:\n${deployReview.summary}`,
    ];
    if (deployReview.reasons.length > 0) {
      parts.push(`Deployment review reasons:\n- ${deployReview.reasons.join("\n- ")}`);
    }
    if (deployReview.evidence.length > 0) {
      parts.push(`Deployment review evidence:\n- ${deployReview.evidence.join("\n- ")}`);
    }
    if (deployReview.suggestedRevisionPrompt.trim()) {
      parts.push(`Suggested revision prompt:\n${deployReview.suggestedRevisionPrompt}`);
    }
    if (acceptReviewSuggestion.trim()) {
      parts.push(`Additional user suggestions:\n${acceptReviewSuggestion.trim()}`);
    }
    parts.push("Please regenerate the tool code and package.json with targeted fixes based on deployment logs.");

    setIsAcceptingReview(false);
    setAcceptReviewSuggestion("");
    handleRunRound(parts.join("\n\n"), history, engineState);
  };

  const handleAbandonDeployReview = () => {
    setDeployReview(null);
    setIsAcceptingReview(false);
    setAcceptReviewSuggestion("");
  };

  const nonCodeSections = useMemo(
    () => sections.filter((section) => section.name !== "code"),
    [sections],
  );
  const codeSections = useMemo(
    () => sections.filter((section) => section.name === "code"),
    [sections],
  );
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
          if (previousEdited !== content) {
            next[path] = content;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
    lastGeneratedFilesRef.current = latestGeneratedFiles;
  }, [latestGeneratedFiles]);

  const effectiveFiles = useMemo(
    () => ({ ...latestGeneratedFiles, ...editedFiles }),
    [latestGeneratedFiles, editedFiles],
  );
  const generatedAppTs = effectiveFiles["src/app.ts"] || "";
  const generatedPackageJson = effectiveFiles["package.json"] || "";
  const generatedEnvTemplate = effectiveFiles[".env.viv"] || "";
  const envTemplateKeys = useMemo(() => parseEnvTemplateKeys(generatedEnvTemplate), [generatedEnvTemplate]);
  const packageToolName = useMemo(() => tryReadPackageName(generatedPackageJson), [generatedPackageJson]);
  const defaultDeployToolName = packageToolName || "generated-tool";
  const hasDeployableFiles = generatedAppTs.trim().length > 0 && generatedPackageJson.trim().length > 0;
  const hasRenderedFinalCode = codeSections.some(
    (section) => decodeXmlEntities(section.content).trim().length > 0,
  );
  const canStartNewTool = isFinalized && hasRenderedFinalCode && !isGenerating;
  const canDeploy = isFinalized && hasDeployableFiles && !isGenerating && deployStatus !== "deploying";
  const canReviewDeployLogs = deployStatus === "done" && deployLogs.trim().length > 0 && !isReviewingDeployLogs;
  const draftDisplayContent = draftSection && draftSection.name !== "code"
    ? formatSectionContentForDisplay(draftSection)
    : "";
  const visibleDraft = draftSection && (
    draftSection.name === "code"
      ? decodeXmlEntities(draftSection.content).trim().length > 0
      : draftDisplayContent.trim().length > 0
  )
    ? draftSection
    : null;

  useEffect(() => {
    if (!deployToolName.trim() && packageToolName) {
      setDeployToolName(packageToolName);
    }
  }, [deployToolName, packageToolName]);

  return (
    <div className="h-screen bg-gray-50 text-gray-900 font-sans flex flex-col">
      <div className="px-6 py-4 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2 text-primary">
              <Code className="text-blue-500" />
              YoMo Tool Gen
            </h1>
            <p className="text-sm text-gray-500 mt-1">Autonomous multi-round workflow</p>
          </div>
          <div className="flex items-center gap-3 overflow-x-auto pb-1">
            {STAGES.map((s, i) => {
              const isActive = s.id === stage;
              const isPast = STAGES.findIndex((x) => x.id === stage) > i;

              return (
                <div key={s.id} className="flex items-center gap-2 shrink-0">
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors ${
                      isActive
                        ? "border-blue-500 text-blue-500 bg-blue-50"
                        : isPast
                        ? "border-green-500 text-green-500 bg-green-50"
                        : "border-gray-200 text-gray-400"
                    }`}
                  >
                    {isActive && isGenerating ? <Loader2 size={14} className="animate-spin" /> : isPast ? <Check size={14} /> : s.icon}
                  </div>
                  <span
                    className={`text-xs font-medium hidden xl:inline-block ${
                      isActive ? "text-blue-600" : isPast ? "text-gray-800" : "text-gray-400"
                    }`}
                  >
                    {s.label}
                  </span>
                  {i < STAGES.length - 1 && (
                    <div className={`w-6 h-px ${isPast ? "bg-green-300" : "bg-gray-200"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12">
        <div className="xl:col-span-3 border-b xl:border-b-0 xl:border-r border-gray-200 bg-white min-h-0 flex flex-col">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700">Conversation</h2>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
            {history.length === 0 ? (
              <p className="text-sm text-gray-500">Start by entering your tool requirement.</p>
            ) : (
              history.map((msg, index) => {
                const messageKey = `${msg.role}-${index}`;
                const displayText = formatHistoryMessageForDisplay(msg);
                const isExpanded = Boolean(expandedMessages[messageKey]);
                const canExpand = displayText.length > 0;

                return (
                  <div
                    key={messageKey}
                    className={`rounded-lg px-3 py-2 text-sm min-h-24 flex flex-col ${
                      msg.role === "user" ? "bg-blue-50 border border-blue-100" : "bg-gray-50 border border-gray-200"
                    }`}
                  >
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">{msg.role}</p>
                    <p
                      className="whitespace-pre-wrap text-gray-700"
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
                        onClick={() => toggleMessageExpanded(messageKey)}
                        className="mt-2 self-end text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        {isExpanded ? "Collapse" : "View Full"}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <div className="border-t border-gray-200 p-5 space-y-3">
            {history.length === 0 ? (
              <InitialRequirementComposer isGenerating={isGenerating} onStart={handleStartFirstRound} />
            ) : !isAwaitingInput ? (
              <div className="flex flex-col items-center text-center gap-3 py-3 text-green-600">
                <p className="text-sm font-semibold">Workflow completed.</p>
              </div>
            ) : isFinalized ? (
              <FinalRevisionComposer
                isGenerating={isGenerating}
                finalRevisionMode={finalRevisionMode}
                onModeChange={setFinalRevisionMode}
                onSubmit={handleSubmitFinalRevision}
              />
            ) : pendingQuestions.length > 0 ? (
              <p className="text-sm text-gray-600">Please answer the pending questions in the middle panel.</p>
            ) : (
              <FeedbackComposer
                isGenerating={isGenerating}
                onContinue={() => handleSubmitFeedback("continue")}
                onSend={(text) => handleSubmitFeedback("feedback", text)}
              />
            )}
          </div>
        </div>

        <div className="xl:col-span-4 border-b xl:border-b-0 xl:border-r border-gray-200 bg-gray-50 min-h-0 flex flex-col">
          <div className="px-5 py-4 border-b border-gray-200 bg-white">
            <h2 className="text-sm font-semibold text-gray-700">Questions & Analysis</h2>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            {nonCodeSections.map((sec, index) => {
              if (sec.name === "questions" && pendingQuestions.length > 0) {
                return (
                  <div key={`${sec.name}-${index}`} className="bg-white rounded-xl shadow-sm border border-blue-200 p-4 space-y-4">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                      <MessageSquare className="text-blue-500" size={16} /> Questions
                    </h3>
                    {pendingQuestions.map((q) => (
                      <div key={q.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <p className="font-medium text-sm mb-2">{q.question}</p>
                        <div className="flex flex-col gap-2">
                          {q.options.map((opt) => (
                            <label key={opt.key} className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="radio"
                                name={q.id}
                                value={opt.key}
                                checked={questionAnswers[q.id] === opt.key}
                                onChange={(e) => setQuestionAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                                className="text-blue-600 focus:ring-blue-500"
                              />
                              <span className="font-mono text-gray-500">{opt.key}:</span> {opt.label}
                            </label>
                          ))}
                          {q.allowManual && (
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                type="radio"
                                name={q.id}
                                value="manual"
                                checked={questionAnswers[q.id] !== undefined && !q.options.find((o) => o.key === questionAnswers[q.id])}
                                onChange={() => setQuestionAnswers((prev) => ({ ...prev, [q.id]: "" }))}
                              />
                              <input
                                type="text"
                                placeholder="Type custom answer..."
                                className="flex-1 p-1 text-sm border-b border-gray-300 focus:outline-none focus:border-blue-500 bg-transparent"
                                onChange={(e) => setQuestionAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                                onClick={() => {
                                  if (q.options.find((o) => o.key === questionAnswers[q.id])) {
                                    setQuestionAnswers((prev) => ({ ...prev, [q.id]: "" }));
                                  }
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={handleSubmitQuestions}
                      disabled={isGenerating}
                      className="flex items-center justify-center gap-2 w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg font-medium transition-colors"
                    >
                      <Send size={16} /> Submit Answers
                    </button>
                  </div>
                );
              }

              const formattedContent = formatSectionContentForDisplay(sec);
              if (!formattedContent.trim()) return null;

              return (
                <div
                  key={`${sec.name}-${index}`}
                  className={`bg-white rounded-xl shadow-sm border overflow-hidden ${sec.name === "review" && sec.attrs.result === "FAIL" ? "border-red-300" : "border-gray-200"}`}
                >
                  <div className={`px-4 py-2 border-b border-gray-100 text-xs font-bold uppercase tracking-wider flex justify-between ${sec.name === "review" && sec.attrs.result === "FAIL" ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-500"}`}>
                    <span>{sec.name.replace("_", " ")}</span>
                    {sec.name === "review" && (
                      <span className={sec.attrs.result === "PASS" ? "text-green-600" : "text-red-600"}>
                        RESULT: {sec.attrs.result}
                      </span>
                    )}
                  </div>
                  <div className="p-4 text-sm whitespace-pre-wrap text-gray-700">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{formattedContent}</ReactMarkdown>
                  </div>
                </div>
              );
            })}

            {visibleDraft && visibleDraft.name !== "code" && (
              <div className="bg-white rounded-xl shadow-sm border border-blue-200 overflow-hidden animate-pulse">
                <div className="px-4 py-2 border-b border-blue-100 text-xs font-bold uppercase tracking-wider flex justify-between bg-blue-50 text-blue-600">
                  <span>{visibleDraft.name.replace("_", " ")}</span>
                  <span>Generating...</span>
                </div>
                <div className="p-4 text-sm whitespace-pre-wrap text-gray-700">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{draftDisplayContent}</ReactMarkdown>
                </div>
              </div>
            )}

            {isGenerating && (
              <div className="bg-white rounded-xl shadow-sm border border-blue-200 px-4 py-3 text-blue-700 text-sm flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Generating {stage.replace("_", " ")}...
              </div>
            )}

            {!isGenerating && pendingQuestions.length === 0 && nonCodeSections.length === 0 && (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                Questions and analysis will appear here.
              </div>
            )}

            <div ref={logsEndRef} />
          </div>
        </div>

        <div className="xl:col-span-5 bg-gray-100 min-h-0 flex flex-col">
          <div className="px-5 py-4 border-b border-gray-200 bg-white flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-700">Generated Code</h2>
            {canStartNewTool ? (
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-xs font-medium"
              >
                <CheckCircle2 size={14} /> Start New Tool
              </button>
            ) : isFinalized ? (
              <span className="text-xs text-gray-500">Waiting for final code render...</span>
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
                  onToggleEdit={path ? () => setEditingFiles((prev) => ({ ...prev, [path]: !prev[path] })) : undefined}
                  onCodeChange={path ? (nextCode) => setEditedFiles((prev) => ({ ...prev, [path]: nextCode })) : undefined}
                  canReset={Boolean(path) && code !== generatedCode}
                  onReset={path ? () => {
                    setEditedFiles((prev) => ({ ...prev, [path]: generatedCode }));
                    setEditingFiles((prev) => ({ ...prev, [path]: false }));
                  } : undefined}
                  copied={copied}
                  onCopy={() => handleCopy(code)}
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
                onCopy={() => handleCopy(decodeXmlEntities(visibleDraft.content))}
              />
            )}

            {codeSections.length === 0 && (!visibleDraft || visibleDraft.name !== "code") && (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                Generated TypeScript code will appear here.
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-100 text-xs font-bold uppercase tracking-wider bg-gray-50 text-gray-500">
                Deploy
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600">Vivgrid Token</label>
                  <input
                    type="password"
                    value={deployToken}
                    onChange={(e) => setDeployToken(e.target.value)}
                    placeholder="Enter deploy token"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={deployStatus === "deploying"}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600">Tool Name</label>
                  <input
                    type="text"
                    value={deployToolName}
                    onChange={(e) => setDeployToolName(e.target.value)}
                    placeholder={defaultDeployToolName}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={deployStatus === "deploying"}
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleClickDeploy}
                    disabled={!canDeploy}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg font-medium transition-colors"
                  >
                    {deployStatus === "deploying" ? (
                      <><Loader2 size={16} className="animate-spin" /> Deploying...</>
                    ) : (
                      <><Play size={16} /> Deploy</>
                    )}
                  </button>
                  <button
                    onClick={handleReviewDeployLogs}
                    disabled={!canReviewDeployLogs}
                    className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400 text-gray-700 rounded-lg font-medium transition-colors border border-gray-300"
                  >
                    {isReviewingDeployLogs ? "Reviewing..." : "AI Review Deploy Logs"}
                  </button>
                </div>

                {!hasDeployableFiles && (
                  <p className="text-xs text-gray-500">
                    Deployment requires generated <code>src/app.ts</code> and <code>package.json</code>.
                  </p>
                )}

                {deployError && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 whitespace-pre-wrap">
                    {deployError}
                  </div>
                )}

                <div ref={deployLogsContainerRef} className="bg-gray-950 text-gray-100 rounded-md p-3 h-56 overflow-y-auto text-xs font-mono whitespace-pre-wrap">
                  {deployLogs.trim().length > 0 ? deployLogs : "Deploy logs will appear here."}
                </div>

                {deployResult && (
                  <p className={`text-sm ${deployResult.success ? "text-green-700" : "text-amber-700"}`}>
                    {deployResult.success
                      ? `Deployment completed for ${deployResult.toolName}.`
                      : `Deployment finished with errors for ${deployResult.toolName}.`}
                  </p>
                )}

                {deployReview && (
                  <div className={`border rounded-lg p-3 space-y-3 ${getDeployReviewStatusView(deployReview.status).panelClassName}`}>
                    {(() => {
                      const hasCodeFixSuggestion = deployReview.suggestedRevisionPrompt.trim().length > 0;
                      return (
                        <>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-700">Deploy Log Review</p>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-semibold ${getDeployReviewStatusView(deployReview.status).badgeClassName}`}>
                        {getDeployReviewStatusView(deployReview.status).icon}
                        {getDeployReviewStatusView(deployReview.status).label}
                      </span>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-md p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Customer Summary</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">{deployReview.summary}</p>
                      {deployReview.reviewStage && (
                        <p className="text-xs text-gray-500 mt-2">Target Stage: {deployReview.reviewStage}</p>
                      )}
                    </div>

                    {deployReview.reasons.length > 0 && (
                      <div className="text-sm text-gray-700 bg-white border border-gray-200 rounded-md p-3">
                        <p className="font-medium text-gray-800">Reasons</p>
                        <ul className="list-disc pl-5 space-y-1">
                          {deployReview.reasons.map((reason, index) => (
                            <li key={`${reason}-${index}`}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {deployReview.evidence.length > 0 && (
                      <div className="text-sm text-gray-700 bg-white border border-gray-200 rounded-md p-3">
                        <p className="font-medium text-gray-800">Evidence</p>
                        <ul className="list-disc pl-5 space-y-1">
                          {deployReview.evidence.map((item, index) => (
                            <li key={`${item}-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="text-sm text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded-md p-3">
                      <p className="font-medium text-gray-800">Suggested Prompt</p>
                      <p className="mt-1">{deployReview.suggestedRevisionPrompt || "No code regeneration prompt provided."}</p>
                    </div>

                    {isAcceptingReview && hasCodeFixSuggestion && (
                      <div className="space-y-2">
                        <textarea
                          value={acceptReviewSuggestion}
                          onChange={(e) => setAcceptReviewSuggestion(e.target.value)}
                          placeholder="Optional: add your own suggestion before regenerating"
                          className="w-full h-24 p-2 border border-gray-300 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleConfirmAcceptAndRegenerate}
                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium"
                          >
                            Confirm Regenerate
                          </button>
                          <button
                            onClick={() => {
                              setIsAcceptingReview(false);
                              setAcceptReviewSuggestion("");
                            }}
                            className="flex-1 py-2 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 rounded-md text-sm font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {!isAcceptingReview && hasCodeFixSuggestion && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setIsAcceptingReview(true)}
                          className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium"
                        >
                          Accept and Regenerate
                        </button>
                        <button
                          onClick={handleAbandonDeployReview}
                          className="flex-1 py-2 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 rounded-md text-sm font-medium"
                        >
                          Abandon
                        </button>
                      </div>
                    )}

                    {!hasCodeFixSuggestion && (
                      <div className="flex gap-2">
                        <button
                          onClick={handleAbandonDeployReview}
                          className="w-full py-2 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 rounded-md text-sm font-medium"
                        >
                          Close
                        </button>
                      </div>
                    )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {envModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-800">Fill Environment Variables</h3>
              <p className="text-xs text-gray-500 mt-1">Values are required before deployment.</p>
            </div>
            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {requiredEnvKeys.map((key) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600">{key}</label>
                  <input
                    type="text"
                    value={envValues[key] || ""}
                    onChange={(e) => setEnvValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={`Enter value for ${key}`}
                  />
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex gap-2">
              <button
                onClick={() => {
                  setEnvModalOpen(false);
                  setDeployStatus("idle");
                }}
                className="flex-1 py-2 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitEnvAndDeploy}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium"
              >
                Deploy with Env
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
