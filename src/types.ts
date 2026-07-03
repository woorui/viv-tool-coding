import type { CoreMessage, LanguageModel } from "ai";

export type SectionName =
  | "requirement_review"
  | "questions"
  | "implementation"
  | "code"
  | "review"
  | "next_action";

export type ReviewResult = "PASS" | "FAIL";

export type NextAction = "ask_user" | "revise_code" | "finalize";

export type WorkflowStage = "idle" | SectionName;

export interface XmlSection {
  name: SectionName;
  attrs: Record<string, string>;
  raw: string;
  content: string;
}

export interface WorkflowState {
  stage: WorkflowStage;
  failCount: number;
  lastReviewResult?: ReviewResult;
}

export interface RunWorkflowRoundOptions {
  model: LanguageModel;
  userInput: string;
  history?: readonly CoreMessage[];
  state?: WorkflowState;
  systemPrompt?: string;
  signal?: AbortSignal;
  onSection?: (section: XmlSection, state: WorkflowState) => void;
  onDraftSection?: (section: XmlSection | null) => void;
  onChunk?: (chunk: string) => void;
}

export interface RunWorkflowRoundResult {
  sections: XmlSection[];
  state: WorkflowState;
}
