"use client";

import { FileText, MessageSquare, Code, CheckCircle2, Check } from "lucide-react";
import type { StageConfig } from "@/types/ui";

export const STAGES: StageConfig[] = [
  { id: "requirement_review", label: "Requirement Review", icon: <FileText size={16} /> },
  { id: "questions", label: "Questions", icon: <MessageSquare size={16} /> },
  { id: "implementation", label: "Implementation Plan", icon: <FileText size={16} /> },
  { id: "code", label: "Generating Code", icon: <Code size={16} /> },
  { id: "review", label: "Review", icon: <CheckCircle2 size={16} /> },
  { id: "next_action", label: "Done", icon: <Check size={16} /> },
];
