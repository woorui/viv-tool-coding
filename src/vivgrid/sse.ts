import type { VivgridSseEvent } from "./types";

function parseBlock(block: string): VivgridSseEvent | null {
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const eventLine = lines.find((line) => line.startsWith("event:"));
  const dataLines = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim());

  if (dataLines.length === 0) {
    return null;
  }

  const rawData = dataLines.join("\n");
  const event = eventLine ? eventLine.slice("event:".length).trim() : "message";

  try {
    return {
      event,
      data: JSON.parse(rawData),
      rawData,
    };
  } catch {
    return {
      event,
      data: rawData,
      rawData,
    };
  }
}

export async function* parseSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<VivgridSseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const event = parseBlock(block);
      if (event) {
        yield event;
      }
    }
  }

  const trailing = parseBlock(buffer);
  if (trailing) {
    yield trailing;
  }
}
