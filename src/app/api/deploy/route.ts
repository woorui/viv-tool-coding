import { NextResponse } from "next/server";
import { buildZipFromFiles, VivgridToolClient } from "@/index";

type DeployRequestBody = {
  toolName?: string;
  files?: Record<string, string>;
  envs?: Record<string, string>;
};

function toLogText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sanitizeToolName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export async function POST(req: Request) {
  try {
    const token = req.headers.get("x-vivgrid-token")?.trim();
    if (!token) {
      return NextResponse.json({ error: "Missing x-vivgrid-token header" }, { status: 400 });
    }

    const body = (await req.json()) as DeployRequestBody;
    const appTs = body.files?.["src/app.ts"];
    const packageJson = body.files?.["package.json"];
    if (!appTs || !packageJson) {
      return NextResponse.json(
        { error: "files must include src/app.ts and package.json" },
        { status: 400 },
      );
    }

    const rawToolName = body.toolName?.trim() || `tool-${Date.now()}`;
    const toolName = sanitizeToolName(rawToolName);
    if (!toolName) {
      return NextResponse.json({ error: "Invalid toolName" }, { status: 400 });
    }

    const envs = body.envs ?? {};
    const client = new VivgridToolClient({
      ...(process.env.VIVGRID_BASE_URL ? { baseUrl: process.env.VIVGRID_BASE_URL } : {}),
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
        };

        try {
          const zipFile = buildZipFromFiles({
            "src/app.ts": appTs,
            "package.json": packageJson,
          });

          for await (const evt of client.buildToolFromZip({
            toolName,
            token,
            zipFile,
            language: "node",
          })) {
            send("log", { text: toLogText(evt.data) });
          }

          try {
            const removeResult = await client.removeTool({ toolName, token });
            send("log", { text: toLogText(removeResult) });
          } catch (error) {
            send("log", {
              text: error instanceof Error ? error.message : String(error),
            });
          }

          const createResult = await client.createTool({
            toolName,
            token,
            envs,
          });
          send("log", { text: toLogText(createResult) });
          send("done", { success: true, toolName });
        } catch (error) {
          send("error", {
            message: error instanceof Error ? error.message : String(error),
          });
          send("done", { success: false, toolName });
        } finally {
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
