import type { SectionName, XmlSection } from "./types";

const ALLOWED_SECTIONS: readonly SectionName[] = [
  "requirement_review",
  "questions",
  "implementation",
  "code",
  "review",
  "next_action",
];

function parseAttributes(input: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrPattern = /([a-zA-Z_][\w-]*)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(input)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

interface StartTagMatch {
  index: number;
  name: SectionName;
  openTag: string;
  attrs: Record<string, string>;
}

function findAllowedStartTag(input: string): StartTagMatch | undefined {
  const pattern = /<(requirement_review|questions|implementation|code|review|next_action)(\s+[^>]*)?>/;
  const match = pattern.exec(input);
  if (!match) {
    return undefined;
  }

  const name = match[1] as SectionName;
  if (!ALLOWED_SECTIONS.includes(name)) {
    return undefined;
  }

  const attrText = match[2] ?? "";
  return {
    index: match.index,
    name,
    openTag: match[0],
    attrs: parseAttributes(attrText),
  };
}

function containsNonWhitespace(input: string): boolean {
  return input.trim().length > 0;
}

export class XmlSectionStreamParser {
  private buffer = "";

  push(chunk: string): XmlSection[] {
    this.buffer += chunk;
    const output: XmlSection[] = [];

    while (true) {
      const startTag = findAllowedStartTag(this.buffer);
      if (!startTag) {
        return output;
      }

      const prefix = this.buffer.slice(0, startTag.index);
      if (containsNonWhitespace(prefix)) {
        throw new Error("Non-XML or unsupported XML content detected before a valid section tag");
      }

      const closeTag = `</${startTag.name}>`;
      const contentStart = startTag.index + startTag.openTag.length;
      const closeIndex = this.buffer.indexOf(closeTag, contentStart);
      if (closeIndex === -1) {
        return output;
      }

      const rawEnd = closeIndex + closeTag.length;
      const raw = this.buffer.slice(startTag.index, rawEnd);
      const content = this.buffer.slice(contentStart, closeIndex);

      output.push({
        name: startTag.name,
        attrs: startTag.attrs,
        raw,
        content,
      });

      this.buffer = this.buffer.slice(rawEnd);
    }
  }

  getDraftSection(): XmlSection | null {
    const startTag = findAllowedStartTag(this.buffer);
    if (!startTag) {
      return null;
    }

    const prefix = this.buffer.slice(0, startTag.index);
    if (containsNonWhitespace(prefix)) {
      return null;
    }

    const closeTag = `</${startTag.name}>`;
    const contentStart = startTag.index + startTag.openTag.length;
    const closeIndex = this.buffer.indexOf(closeTag, contentStart);
    if (closeIndex !== -1) {
      return null;
    }

    return {
      name: startTag.name,
      attrs: startTag.attrs,
      raw: this.buffer.slice(startTag.index),
      content: this.buffer.slice(contentStart),
    };
  }

  finalize(): void {
    if (containsNonWhitespace(this.buffer)) {
      throw new Error("Stream ended with unparsed XML content");
    }
  }
}
