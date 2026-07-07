import type { ReactNode } from "react";

export type Stage =
  | "idle"
  | "requirement_review"
  | "questions"
  | "implementation"
  | "code"
  | "review"
  | "next_action";

export interface Section {
  name: string;
  content: string;
  attrs: Record<string, string>;
  raw: string;
}

export interface QuestionItem {
  id: string;
  question: string;
  options: { key: string; label: string }[];
  allowManual: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type NextActionValue = "ask_user" | "revise_code" | "finalize";
export type FinalRevisionMode = "code_only" | "full_review";
export type DeployStatus = "idle" | "collecting_env" | "deploying" | "done";

export interface DeployReviewData {
  status: "success" | "failed" | "inconclusive";
  reviewStage: "build typescript" | "generate llm_tool.json" | null;
  summary: string;
  reasons: string[];
  evidence: string[];
  suggestedRevisionPrompt: string;
}

export interface StageConfig {
  id: Stage;
  label: string;
  icon: ReactNode;
}
