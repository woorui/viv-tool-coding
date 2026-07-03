import { NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { runWorkflowRound } from "@/engine";
import { DEFAULT_WORKFLOW_PROMPT } from "@/prompt";
import { initialWorkflowState } from "@/state-machine";

export async function POST(req: Request) {
  try {
    const { userInput, history, state } = await req.json();

    if (!userInput) {
      return NextResponse.json({ error: "Missing userInput" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY environment variable. Please configure it.");
    }

    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
    });

    const modelId = process.env.MODEL_ID || "gpt-4o";

    const strictSystemPrompt = `${DEFAULT_WORKFLOW_PROMPT}

Follow this execution flow strictly:
1) Start with requirement review only. If key info is missing, do not generate implementation/code.
2) Output <questions> with at most 3 <item> blocks, each item must include <question>, 1-3 <option>, and <allow_manual>true</allow_manual>.
3) After user supplements info, re-run requirement review until implementation is feasible.
4) Then output <implementation>, then <code path="..." lang="...">.
5) Every code output must be followed by <review result="PASS|FAIL">. FAIL requires <failed_checks>, <reasons>, <fix_instructions>.
6) End with <next_action> ask_user|revise_code|finalize.

Output shape examples (must follow exactly):
<questions><item id="q1"><question>...</question><option key="1">...</option><allow_manual>true</allow_manual></item></questions>
<review result="FAIL"><failed_checks>...</failed_checks><reasons>...</reasons><fix_instructions>...</fix_instructions></review>

Never output markdown-only lists for <questions>.
If you output <questions>, prefer ending response right after </questions>.
If you still output <next_action> after <questions>, it must be exactly ask_user.`;

    let finalState: any = null;

    const abortController = new AbortController();
    const encoder = new TextEncoder();
    const draftThrottleMs = 80;
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let lastDraftSentAt = 0;
          let lastDraftRaw = "";

          const result = await runWorkflowRound({
            model: openai(modelId),
            userInput,
            history: history || [],
            state: state || initialWorkflowState(),
            systemPrompt: strictSystemPrompt,
            signal: abortController.signal,
            onChunk: (chunk) => {
              controller.enqueue(
                encoder.encode(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`)
              );
            },
            onDraftSection: (section) => {
              if (!section) {
                return;
              }

              const now = Date.now();
              if (section.raw === lastDraftRaw && now - lastDraftSentAt < draftThrottleMs) {
                return;
              }
              if (now - lastDraftSentAt < draftThrottleMs) {
                return;
              }

              lastDraftRaw = section.raw;
              lastDraftSentAt = now;
              controller.enqueue(
                encoder.encode(`event: section_draft\ndata: ${JSON.stringify(section)}\n\n`)
              );
            },
            onSection: (section, state) => {
              finalState = state;
              controller.enqueue(
                encoder.encode(`event: state\ndata: ${JSON.stringify({ stage: state.stage })}\n\n`)
              );
              controller.enqueue(
                encoder.encode(`event: section\ndata: ${JSON.stringify(section)}\n\n`)
              );
              
              // 关键优化：一旦收到了 next_action 块，说明本回合真正结束，可以直接中断底层 LLM 的流，防止它继续生成多余的废话
              if (section.name === "next_action") {
                abortController.abort();
              }
            },
          });
          controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ state: result.state })}\n\n`));
          controller.close();
        } catch (err: any) {
          // 如果是因为我们主动 abort 导致的错误，当做正常结束处理
          if (err.name === 'AbortError' || err.message?.includes('abort')) {
             controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ state: finalState })}\n\n`));
          } else {
             controller.enqueue(
               encoder.encode(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`)
             );
          }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
