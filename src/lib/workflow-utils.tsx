import type { Section, QuestionItem, NextActionValue, ChatMessage, DeployReviewData } from "@/types";
import { CircleCheckBig, AlertTriangle, HelpCircle } from "lucide-react";

export function normalizeText(inputText: string) {
  return inputText.replace(/\s+/g, " ").trim();
}

export function parseQuestionItems(xmlContent: string): QuestionItem[] {
  const items: QuestionItem[] = [];
  const itemPattern = /<item\b([^>]*)>([\s\S]*?)<\/item>/g;
  let itemMatch;

  while ((itemMatch = itemPattern.exec(xmlContent)) !== null) {
    const attrs = itemMatch[1] || "";
    const body = itemMatch[2] || "";
    const idMatch = /\bid\s*=\s*"([^"]+)"/.exec(attrs);
    const questionMatch = /<question>([\s\S]*?)<\/question>/.exec(body);
    const allowManual = /<allow_manual>\s*true\s*<\/allow_manual>/.test(body);

    const options: { key: string; label: string }[] = [];
    const optionPattern = /<option\b([^>]*)>([\s\S]*?)<\/option>/g;
    let optionMatch;
    while ((optionMatch = optionPattern.exec(body)) !== null) {
      const optionAttrs = optionMatch[1] || "";
      const keyMatch = /\bkey\s*=\s*"([^"]+)"/.exec(optionAttrs);
      options.push({
        key: keyMatch?.[1] ?? String(options.length + 1),
        label: normalizeText(optionMatch[2] || ""),
      });
    }

    items.push({
      id: idMatch?.[1] ?? `q${items.length + 1}`,
      question: normalizeText(questionMatch?.[1] || ""),
      options,
      allowManual,
    });
  }

  return items;
}

export function parseNextAction(rawContent?: string): NextActionValue | null {
  if (!rawContent) return null;
  const matched = rawContent.toLowerCase().match(/ask_user|revise_code|finalize/);
  if (!matched) return null;
  return matched[0] as NextActionValue;
}

export function decodeXmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, value: string) => String.fromCodePoint(parseInt(value, 16)));
}

export function stripXmlTagsToReadableText(input: string): string {
  const decoded = decodeXmlEntities(input || "");
  const withoutComments = decoded.replace(/<!--[\s\S]*?-->/g, "");
  const withoutTags = withoutComments.replace(/<[^>]+>/g, "\n");
  return withoutTags
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function extractXmlTagContent(xml: string, tagName: string): string {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const matched = pattern.exec(xml);
  if (!matched) return "";
  return stripXmlTagsToReadableText(matched[1]);
}

export function formatQuestionsDisplay(xmlContent: string): string {
  const items = parseQuestionItems(xmlContent);
  if (items.length === 0) {
    return stripXmlTagsToReadableText(xmlContent);
  }

  return items
    .map((item, index) => {
      const lines = [`${index + 1}. ${item.question || "(No question text provided)"}`];
      const validOptions = item.options.filter((option) => option.label.trim().length > 0);
      for (const option of validOptions) {
        lines.push(`   - ${option.key}: ${option.label}`);
      }
      if (item.allowManual) {
        lines.push("   - Manual input supported");
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export function formatReviewDisplay(content: string): string {
  const blocks: Array<{ title: string; value: string }> = [
    { title: "Failed Checks", value: extractXmlTagContent(content, "failed_checks") },
    { title: "Reasons", value: extractXmlTagContent(content, "reasons") },
    { title: "Fix Instructions", value: extractXmlTagContent(content, "fix_instructions") },
  ].filter((block) => block.value.trim().length > 0);

  if (blocks.length === 0) {
    return stripXmlTagsToReadableText(content);
  }

  return blocks
    .map((block) => `**${block.title}**\n${block.value}`)
    .join("\n\n");
}

export function formatSectionContentForDisplay(section: Pick<Section, "name" | "content">): string {
  if (section.name === "questions") {
    return formatQuestionsDisplay(section.content);
  }

  if (section.name === "review") {
    return formatReviewDisplay(section.content);
  }

  if (section.name === "next_action") {
    const action = parseNextAction(section.content);
    if (!action) return "";
    if (action === "ask_user") return "User input is required";
    if (action === "revise_code") return "Continue revising the code";
    return "Workflow completed";
  }

  return stripXmlTagsToReadableText(section.content);
}

export function formatHistoryMessageForDisplay(message: ChatMessage): string {
  const base = message.role === "assistant"
    ? stripXmlTagsToReadableText(message.content)
    : message.content.trim();

  if (!base) return message.role === "assistant" ? "(No displayable content in this round)" : "(Empty message)";
  return base;
}

export function parseSseEventBlock(block: string): { eventType: string; data: any } | null {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  const eventLine = lines.find((line) => line.startsWith("event:"));
  const dataLines = lines.filter((line) => line.startsWith("data:"));
  if (!eventLine || dataLines.length === 0) return null;

  const eventType = eventLine.slice("event:".length).trim();
  const dataText = dataLines.map((line) => line.slice("data:".length).trim()).join("\n");

  try {
    return { eventType, data: JSON.parse(dataText) };
  } catch {
    return null;
  }
}

export function parseEnvTemplateKeys(envTemplate: string): string[] {
  const keys = new Set<string>();
  const lines = envTemplate.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalIndex = line.indexOf("=");
    if (equalIndex <= 0) continue;
    const key = line.slice(0, equalIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    keys.add(key);
  }
  return Array.from(keys);
}

export function tryReadPackageName(packageJsonContent: string): string {
  try {
    const parsed = JSON.parse(packageJsonContent);
    return typeof parsed?.name === "string" ? parsed.name : "";
  } catch {
    return "";
  }
}

export function getDeployReviewStatusView(status: DeployReviewData["status"]): {
  label: string;
  icon: React.ReactNode;
  badgeClassName: string;
  panelClassName: string;
} {
  if (status === "success") {
    return {
      label: "Success",
      icon: <CircleCheckBig size={14} />,
      badgeClassName: "bg-emerald-50 text-emerald-700 border-emerald-200",
      panelClassName: "bg-emerald-50/40 border-emerald-200",
    };
  }

  if (status === "failed") {
    return {
      label: "Failed",
      icon: <AlertTriangle size={14} />,
      badgeClassName: "bg-rose-50 text-rose-700 border-rose-200",
      panelClassName: "bg-rose-50/40 border-rose-200",
    };
  }

  return {
    label: "Inconclusive",
    icon: <HelpCircle size={14} />,
    badgeClassName: "bg-amber-50 text-amber-700 border-amber-200",
    panelClassName: "bg-amber-50/40 border-amber-200",
  };
}
