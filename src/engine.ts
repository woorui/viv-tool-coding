import { streamText } from "ai";
import { DEFAULT_WORKFLOW_PROMPT } from "./prompt.js";
import { applySectionToWorkflowState, initialWorkflowState, type WorkflowValidationOptions } from "./state-machine.js";
import type { RunWorkflowRoundOptions, RunWorkflowRoundResult, WorkflowState, XmlSection } from "./types.js";
import { XmlSectionStreamParser } from "./xml-protocol.js";

export interface WorkflowEngineOptions extends WorkflowValidationOptions {
  maxFailRetries?: number;
}

export async function runWorkflowRound(
  options: RunWorkflowRoundOptions,
  engineOptions?: WorkflowEngineOptions,
): Promise<RunWorkflowRoundResult> {
  const parser = new XmlSectionStreamParser();
  const sections: XmlSection[] = [];
  let state: WorkflowState = options.state ?? initialWorkflowState();

  const messages = [
    ...(options.history ?? []),
    { role: "user" as const, content: options.userInput },
  ];

  const response = streamText({
    model: options.model,
    system: options.systemPrompt ?? DEFAULT_WORKFLOW_PROMPT,
    messages,
    abortSignal: options.signal,
  });

  for await (const chunk of response.textStream) {
    const parsedSections = parser.push(chunk);
    for (const section of parsedSections) {
      state = applySectionToWorkflowState(state, section, engineOptions);
      sections.push(section);
      options.onSection?.(section, state);
    }
  }

  parser.finalize();

  return {
    sections,
    state,
  };
}
