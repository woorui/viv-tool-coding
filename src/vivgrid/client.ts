import { parseSseStream } from "./sse";
import type {
  BuildToolFromFilesParams,
  BuildToolFromZipParams,
  CreateToolParams,
  GetToolStatusParams,
  InvokeToolParams,
  RemoveToolParams,
  StreamToolLogsParams,
  VivgridClientOptions,
  VivgridSseEvent,
} from "./types";
import { buildZipFromFiles, ensureDefaultTsconfig } from "./zip";

const DEFAULT_BASE_URL = "http://127.0.0.1:9040";

function assertNonEmpty(input: string, name: string): void {
  if (!input || input.trim().length === 0) {
    throw new Error(`Invalid ${name}: cannot be empty`);
  }
}

async function parseJsonOrText(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class VivgridToolClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options?: VivgridClientOptions) {
    this.baseUrl = (options?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = options?.fetchImpl ?? fetch;
  }

  private buildUrl(toolName: string, action: string): string {
    assertNonEmpty(toolName, "toolName");
    return `${this.baseUrl}/api/tool/${encodeURIComponent(toolName)}/${action}`;
  }

  private buildAuthHeaders(token: string, extraHeaders?: HeadersInit): HeadersInit {
    assertNonEmpty(token, "token");
    return {
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    };
  }

  private async requestJson(url: string, init: RequestInit): Promise<unknown> {
    const response = await this.fetchImpl(url, init);
    if (!response.ok) {
      const errorBody = await parseJsonOrText(response);
      throw new Error(`Vivgrid request failed (${response.status}): ${JSON.stringify(errorBody)}`);
    }
    return parseJsonOrText(response);
  }

  async *buildToolFromFiles(params: BuildToolFromFilesParams): AsyncGenerator<VivgridSseEvent> {
    const files = params.includeDefaultTsconfig === false
      ? params.files
      : ensureDefaultTsconfig(params.files);
    const zipFile = buildZipFromFiles(files);

    yield* this.buildToolFromZip({
      toolName: params.toolName,
      token: params.token,
      zipFile,
      language: params.language,
    });
  }

  async *buildToolFromZip(params: BuildToolFromZipParams): AsyncGenerator<VivgridSseEvent> {
    const formData = new FormData();
    formData.append("language", params.language ?? "auto");

    let zipBlob: Blob;
    if (params.zipFile instanceof Blob) {
      zipBlob = params.zipFile;
    } else if (params.zipFile instanceof ArrayBuffer) {
      zipBlob = new Blob([new Uint8Array(params.zipFile)], { type: "application/zip" });
    } else {
      zipBlob = new Blob([Uint8Array.from(params.zipFile)], { type: "application/zip" });
    }
    formData.append("zip_file", zipBlob, "app.zip");

    const response = await this.fetchImpl(this.buildUrl(params.toolName, "build"), {
      method: "POST",
      headers: this.buildAuthHeaders(params.token, {
        Accept: "text/event-stream",
      }),
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await parseJsonOrText(response);
      throw new Error(`Vivgrid build failed (${response.status}): ${JSON.stringify(errorBody)}`);
    }
    if (!response.body) {
      throw new Error("Vivgrid build stream has no response body");
    }

    yield* parseSseStream(response.body);
  }

  async createTool(params: CreateToolParams): Promise<unknown> {
    return this.requestJson(this.buildUrl(params.toolName, "create"), {
      method: "POST",
      headers: this.buildAuthHeaders(params.token, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ envs: params.envs ?? {} }),
    });
  }

  async getToolStatus(params: GetToolStatusParams): Promise<unknown> {
    return this.requestJson(this.buildUrl(params.toolName, "status"), {
      method: "GET",
      headers: this.buildAuthHeaders(params.token),
    });
  }

  async *streamToolLogs(params: StreamToolLogsParams): AsyncGenerator<VivgridSseEvent> {
    const response = await this.fetchImpl(this.buildUrl(params.toolName, "logs"), {
      method: "GET",
      headers: this.buildAuthHeaders(params.token, {
        Accept: "text/event-stream",
      }),
    });

    if (!response.ok) {
      const errorBody = await parseJsonOrText(response);
      throw new Error(`Vivgrid logs stream failed (${response.status}): ${JSON.stringify(errorBody)}`);
    }
    if (!response.body) {
      throw new Error("Vivgrid logs stream has no response body");
    }

    yield* parseSseStream(response.body);
  }

  async invokeTool(params: InvokeToolParams): Promise<unknown> {
    const args = typeof params.args === "string" ? params.args : JSON.stringify(params.args);

    return this.requestJson(this.buildUrl(params.toolName, "invoke"), {
      method: "POST",
      headers: this.buildAuthHeaders(params.token, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ args }),
    });
  }

  async removeTool(params: RemoveToolParams): Promise<unknown> {
    return this.requestJson(this.buildUrl(params.toolName, "remove"), {
      method: "DELETE",
      headers: this.buildAuthHeaders(params.token),
    });
  }
}
