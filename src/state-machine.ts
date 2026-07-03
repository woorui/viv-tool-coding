import type { NextAction, SectionName, WorkflowState, XmlSection } from "./types.js";

const VALID_NEXT_ACTIONS: readonly NextAction[] = ["ask_user", "revise_code", "finalize"];

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Workflow validation failed: ${message}`);
  }
}

function canTransition(from: WorkflowState["stage"], to: SectionName, state: WorkflowState): boolean {
  if (from === "idle") {
    return to === "requirement_review";
  }

  if (from === "requirement_review") {
    return to === "questions" || to === "implementation";
  }

  if (from === "questions") {
    return to === "requirement_review" || to === "next_action";
  }

  if (from === "implementation") {
    return to === "code";
  }

  if (from === "code") {
    return to === "review";
  }

  if (from === "review") {
    if (state.lastReviewResult === "FAIL") {
      return to === "implementation";
    }
    if (state.lastReviewResult === "PASS") {
      return to === "next_action";
    }
    return false;
  }

  if (from === "next_action") {
    return to === "requirement_review";
  }

  return false;
}

function extractTagBlocks(content: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "g");
  const blocks = content.match(regex);
  return blocks ?? [];
}

function validateQuestions(content: string, maxQuestionsPerRound: number): void {
  const items = extractTagBlocks(content, "item");
  assertCondition(items.length > 0, "questions must include at least one <item>");
  assertCondition(items.length <= maxQuestionsPerRound, `questions exceed max ${maxQuestionsPerRound}`);

  for (const item of items) {
    const options = extractTagBlocks(item, "option");
    assertCondition(options.length > 0, "each question item must include at least one <option>");
    assertCondition(options.length <= 3, "each question item allows at most 3 options");
    assertCondition(
      /<allow_manual>\s*true\s*<\/allow_manual>/.test(item),
      "each question item must include <allow_manual>true</allow_manual>",
    );
  }
}

function validateCodeSection(section: XmlSection): void {
  assertCondition(Boolean(section.attrs.path), "code section requires path attribute");
  assertCondition(Boolean(section.attrs.lang), "code section requires lang attribute");
}

function validateReviewSection(section: XmlSection, state: WorkflowState, maxFailRetries: number): WorkflowState {
  const result = section.attrs.result;
  assertCondition(result === "PASS" || result === "FAIL", "review result must be PASS or FAIL");

  if (result === "FAIL") {
    assertCondition(section.content.includes("<failed_checks>"), "FAIL review missing <failed_checks>");
    assertCondition(section.content.includes("<reasons>"), "FAIL review missing <reasons>");
    assertCondition(section.content.includes("<fix_instructions>"), "FAIL review missing <fix_instructions>");

    const failCount = state.failCount + 1;
    assertCondition(failCount <= maxFailRetries, `FAIL retries exceeded max ${maxFailRetries}`);
    return {
      ...state,
      stage: "review",
      failCount,
      lastReviewResult: "FAIL",
    };
  }

  return {
    ...state,
    stage: "review",
    lastReviewResult: "PASS",
  };
}

function validateNextAction(content: string): void {
  const action = content.trim() as NextAction;
  assertCondition(VALID_NEXT_ACTIONS.includes(action), "next_action must be ask_user, revise_code, or finalize");
}

export interface WorkflowValidationOptions {
  maxQuestionsPerRound?: number;
  maxFailRetries?: number;
}

export function initialWorkflowState(): WorkflowState {
  return {
    stage: "idle",
    failCount: 0,
  };
}

export function applySectionToWorkflowState(
  state: WorkflowState,
  section: XmlSection,
  options?: WorkflowValidationOptions,
): WorkflowState {
  const maxQuestionsPerRound = options?.maxQuestionsPerRound ?? 3;
  const maxFailRetries = options?.maxFailRetries ?? 3;

  assertCondition(
    canTransition(state.stage, section.name, state),
    `invalid transition ${state.stage} -> ${section.name}`,
  );

  if (section.name === "questions") {
    validateQuestions(section.content, maxQuestionsPerRound);
  }

  if (section.name === "code") {
    validateCodeSection(section);
  }

  if (section.name === "review") {
    return validateReviewSection(section, state, maxFailRetries);
  }

  if (section.name === "next_action") {
    validateNextAction(section.content);
    if (state.stage === "questions") {
      assertCondition(section.content.trim() === "ask_user", "next_action after questions must be ask_user");
    }
  }

  if (section.name === "requirement_review" && state.stage === "next_action") {
    return {
      stage: "requirement_review",
      failCount: 0,
      lastReviewResult: undefined,
    };
  }

  return {
    ...state,
    stage: section.name,
  };
}
