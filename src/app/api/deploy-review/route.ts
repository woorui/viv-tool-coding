import { NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

type DeployReviewResponse = {
  status: "success" | "failed" | "inconclusive";
  reviewStage: "build typescript" | "generate llm_tool.json" | null;
  summary: string;
  reasons: string[];
  evidence: string[];
  suggestedRevisionPrompt: string;
};

type ReviewOutcome = {
  status: "success" | "failed" | "inconclusive";
  targetFailureStage: "build typescript" | "generate llm_tool.json" | null;
};

const STAGE_PATTERNS = [
  "start to build node serverless app",
  "generate metadata.json",
  "copy app.ts to build dir",
  "pnpm install",
  "build typescript",
  "generate llm_tool.json",
  "build node serverless",
  "upload metadata.json",
  "upload llm_tool.json",
  "upload artifact.zip",
] as const;

const TARGET_STAGES = ["build typescript", "generate llm_tool.json"] as const;

function getStageLineWindow(lines: string[], stage: string): { start: number; end: number } | null {
  const lowered = lines.map((line) => line.toLowerCase());
  const start = lowered.findIndex((line) => line.includes(stage));
  if (start < 0) return null;

  let end = lines.length;
  for (let i = start + 1; i < lowered.length; i += 1) {
    if (STAGE_PATTERNS.some((pattern) => lowered[i].includes(pattern))) {
      end = i;
      break;
    }
  }

  return { start, end };
}

function isErrorLine(line: string): boolean {
  const lowered = line.toLowerCase();
  if (!lowered.trim()) return false;
  if (lowered.includes("update available")) return false;
  if (lowered.includes("done in") || lowered === "done") return false;

  return /(error|failed|fail|exception|traceback|npm err!|err_pnpm|ts\d{4}|elifecycle|cannot\s|enoent|eacces)/i.test(line);
}

function detectReviewOutcome(logs: string): ReviewOutcome {
  const lines = logs.split(/\r?\n/);
  const targetStageWindows = TARGET_STAGES
    .map((stage) => ({ stage, window: getStageLineWindow(lines, stage) }))
    .filter((item): item is { stage: (typeof TARGET_STAGES)[number]; window: { start: number; end: number } } => Boolean(item.window));

  for (const item of targetStageWindows) {
    const { start, end } = item.window;
    const windowLines = lines.slice(start, end);
    if (windowLines.some((line) => isErrorLine(line))) {
      return {
        status: "failed",
        targetFailureStage: item.stage,
      };
    }
  }

  const hasNonTargetError = lines.some((line, idx) => {
    if (!isErrorLine(line)) return false;
    const insideTargetWindow = targetStageWindows.some((item) => idx >= item.window.start && idx < item.window.end);
    return !insideTargetWindow;
  });

  if (hasNonTargetError) {
    return {
      status: "inconclusive",
      targetFailureStage: null,
    };
  }

  const okTrueCount = logs.match(/\{"ok":true\}/g)?.length ?? 0;
  if (okTrueCount >= 2) {
    return {
      status: "success",
      targetFailureStage: null,
    };
  }

  return {
    status: "inconclusive",
    targetFailureStage: null,
  };
}

function parseJsonObject(text: string): DeployReviewResponse {
  const fallback: DeployReviewResponse = {
    status: "inconclusive",
    reviewStage: null,
    summary: "Deployment logs were reviewed, but structured analysis could not be parsed.",
    reasons: ["Model output was not valid JSON."],
    evidence: [text.slice(0, 400)],
    suggestedRevisionPrompt: "",
  };

  try {
    const parsed = JSON.parse(text) as Partial<DeployReviewResponse>;
    return {
      status:
        parsed.status === "success" || parsed.status === "failed" || parsed.status === "inconclusive"
          ? parsed.status
          : fallback.status,
      reviewStage: fallback.reviewStage,
      summary: typeof parsed.summary === "string" ? parsed.summary : fallback.summary,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String).filter(Boolean) : [],
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence.map(String).filter(Boolean) : [],
      suggestedRevisionPrompt:
        typeof parsed.suggestedRevisionPrompt === "string"
          ? parsed.suggestedRevisionPrompt
          : fallback.suggestedRevisionPrompt,
    };
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(match[0]) as Partial<DeployReviewResponse>;
      return {
        status:
          parsed.status === "success" || parsed.status === "failed" || parsed.status === "inconclusive"
            ? parsed.status
            : fallback.status,
        reviewStage: fallback.reviewStage,
        summary: typeof parsed.summary === "string" ? parsed.summary : fallback.summary,
        reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String).filter(Boolean) : [],
        evidence: Array.isArray(parsed.evidence) ? parsed.evidence.map(String).filter(Boolean) : [],
        suggestedRevisionPrompt:
          typeof parsed.suggestedRevisionPrompt === "string"
            ? parsed.suggestedRevisionPrompt
            : fallback.suggestedRevisionPrompt,
      };
    } catch {
      return fallback;
    }
  }
}

export async function POST(req: Request) {
  try {
    const { logs, files } = (await req.json()) as {
      logs?: string;
      files?: Record<string, string>;
    };
    if (!logs || !logs.trim()) {
      return NextResponse.json({ error: "Missing logs" }, { status: 400 });
    }

    const appTs = files?.["src/app.ts"];
    const packageJson = files?.["package.json"];
    if (!appTs || !packageJson) {
      return NextResponse.json({ error: "Missing src/app.ts or package.json" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY environment variable. Please configure it.");
    }

    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
    });

    const trimmedLogs = logs.trim().slice(-20000);
    const outcome = detectReviewOutcome(trimmedLogs);

    if (outcome.status !== "failed" || !outcome.targetFailureStage) {
      if (outcome.status === "success") {
        return NextResponse.json({
          review: {
            status: "success",
            reviewStage: null,
            summary: "Deployment logs indicate a successful publish flow. No code regeneration is needed.",
            reasons: [],
            evidence: [],
            suggestedRevisionPrompt: "",
          } satisfies DeployReviewResponse,
        });
      }

      return NextResponse.json({
        review: {
            status: "inconclusive",
            reviewStage: null,
            summary:
              "The logs do not show a TypeScript build or llm_tool generation failure. No code-fix recommendation is generated from this review.",
            reasons: [],
          evidence: [],
          suggestedRevisionPrompt: "",
        } satisfies DeployReviewResponse,
      });
    }

    const modelId = process.env.MODEL_ID || "gpt-4o";
    const result = await generateText({
      model: openai(modelId),
      system: `You are a deployment log reviewer for Node serverless tool publishing.

Analyze deployment logs together with the current edited source files and return STRICT JSON only with this exact schema:
{
  "status": "success | failed | inconclusive",
  "summary": "string",
  "reasons": ["string"],
  "evidence": ["string"],
  "suggestedRevisionPrompt": "string"
}

Rules:
- Use log evidence only. Do not guess.
- You must use both logs and provided code files (src/app.ts, package.json) for consistency checks.
- Distinguish ERROR from WARNING/INFO. Update notices are not failures.
- Scope is strictly limited to two code-fixable stages: "build typescript" and "generate llm_tool.json".
- Return status="failed" only when one of those two stages failed in logs.
- For status="failed", reasons/evidence must only refer to the failed stage and its direct root cause.
- For status="failed", reasons/evidence must align with concrete log lines and relevant code/package content.
- For any other failures outside those two stages, return status="inconclusive" with empty reasons/evidence and empty suggestedRevisionPrompt.
- If logs clearly show success, return status="success" with empty reasons/evidence and empty suggestedRevisionPrompt.
- Keep summary customer-friendly in 1-3 sentences.
- reasons and evidence should be concise, up to 3 items each.
- suggestedRevisionPrompt is allowed only when status="failed" and must target fixes in src/app.ts and/or package.json.
- Never include secrets or tokens.
- Return JSON only, no markdown, no extra keys.`,
      prompt: `Review these deployment logs. Focus stage: ${outcome.targetFailureStage}.\n\n[DEPLOY_LOGS]\n${trimmedLogs}\n\n[src/app.ts]\n${appTs.slice(0, 12000)}\n\n[package.json]\n${packageJson.slice(0, 8000)}`,
    });

    const review = parseJsonObject(result.text);
    const sanitizedReview: DeployReviewResponse = {
      status: "failed",
      reviewStage: outcome.targetFailureStage,
      summary: review.summary,
      reasons: review.reasons,
      evidence: review.evidence,
      suggestedRevisionPrompt: review.suggestedRevisionPrompt.trim(),
    };

    if (!sanitizedReview.suggestedRevisionPrompt) {
      sanitizedReview.suggestedRevisionPrompt =
        "Fix the failure in the deployment stage and regenerate src/app.ts and package.json with minimal targeted changes.";
    }

    if (sanitizedReview.reasons.length === 0) {
      sanitizedReview.reasons = [`Failure detected in stage: ${outcome.targetFailureStage}`];
    }

    if (sanitizedReview.evidence.length === 0) {
      sanitizedReview.evidence = [outcome.targetFailureStage];
    }

    return NextResponse.json({ review: sanitizedReview });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
