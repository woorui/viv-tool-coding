import { createOpenAI } from "@ai-sdk/openai";
import { DEFAULT_WORKFLOW_PROMPT, runWorkflowRound } from "../dist/index.js";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY environment variable");
}

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
});

const rl = readline.createInterface({ input, output });

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

function printSection(section) {
  console.log(`\n[${section.name}]`);
  if (Object.keys(section.attrs).length > 0) {
    console.log("attrs:", section.attrs);
  }
  console.log(section.content.trim() || "(empty)");
}

function findSectionContent(sections, name) {
  const section = sections.find((item) => item.name === name);
  return section?.content.trim();
}

function findLatestSectionContent(sections, name) {
  for (let i = sections.length - 1; i >= 0; i -= 1) {
    if (sections[i].name === name) {
      return sections[i].content.trim();
    }
  }
  return undefined;
}

function parseNextAction(rawContent) {
  if (!rawContent) {
    return undefined;
  }
  const matched = rawContent.toLowerCase().match(/ask_user|revise_code|finalize/);
  return matched ? matched[0] : undefined;
}

function normalizeText(inputText) {
  return inputText.replace(/\s+/g, " ").trim();
}

function parseQuestionItems(xmlContent) {
  const items = [];
  const itemPattern = /<item\b([^>]*)>([\s\S]*?)<\/item>/g;
  let itemMatch;

  while ((itemMatch = itemPattern.exec(xmlContent)) !== null) {
    const attrs = itemMatch[1] || "";
    const body = itemMatch[2] || "";
    const idMatch = /\bid\s*=\s*"([^"]+)"/.exec(attrs);
    const questionMatch = /<question>([\s\S]*?)<\/question>/.exec(body);
    const allowManual = /<allow_manual>\s*true\s*<\/allow_manual>/.test(body);

    const options = [];
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

async function answerQuestionsFromSection(questionsContent) {
  const items = parseQuestionItems(questionsContent);
  if (items.length === 0) {
    const fallback = (await rl.question("\n请补充需求信息:\n> ")).trim();
    return fallback.length > 0 ? `用户补充信息:\n${fallback}` : "用户补充信息: 请按当前方向继续并补全缺失需求。";
  }

  const answers = [];
  console.log("\n请回答补充问题（可输入选项 key 或直接手填）：");

  for (const item of items) {
    console.log(`\n[${item.id}] ${item.question}`);
    for (const option of item.options) {
      console.log(`- ${option.key}) ${option.label}`);
    }
    if (item.allowManual) {
      console.log("- 手填) 直接输入你的自定义答案");
    }

    const inputValue = (await rl.question("> ")).trim();
    const selected = item.options.find((option) => option.key === inputValue);
    const answer = selected ? `${selected.key}: ${selected.label}` : (inputValue || "未指定，按推荐方案推进");
    answers.push(`- ${item.id}: ${answer}`);
  }

  return `用户对 questions 的补充回答:\n${answers.join("\n")}`;
}

async function collectUserIntervention(nextAction, hasImplementationSection) {
  console.log("\n请输入下一轮用户指令：");
  console.log("1) 添加修改意见");
  if (hasImplementationSection) {
    console.log("2) 选择实现方式");
    console.log("3) 同时输入实现方式和修改意见");
    console.log("4) 结束会话");
  } else {
    console.log("2) 继续当前方向");
    console.log("3) 结束会话");
  }

  const choice = (await rl.question("> ")).trim();

  if (hasImplementationSection) {
    if (choice === "4") {
      return null;
    }
    if (choice === "2") {
      const strategy = (await rl.question("输入你选择的实现方式（例如：选择方案B，优先稳定性）:\n> ")).trim();
      return strategy.length > 0 ? `实现方式选择：${strategy}` : "实现方式选择：按当前 implementation 中最稳妥方案推进。";
    }
    if (choice === "3") {
      const strategy = (await rl.question("输入实现方式:\n> ")).trim();
      const feedback = (await rl.question("输入修改意见:\n> ")).trim();
      return `实现方式选择：${strategy || "按当前 implementation 中最稳妥方案推进"}\n修改意见：${feedback || "无额外修改，继续实现"}`;
    }

    const feedback = (await rl.question("输入你的修改意见:\n> ")).trim();
    return feedback.length > 0 ? `修改意见：${feedback}` : "修改意见：请继续当前实现并补全细节。";
  }

  if (choice === "3") {
    return null;
  }
  if (choice === "2") {
    return `请继续按当前方向推进。上轮 next_action=${nextAction}。`;
  }

  const feedback = (await rl.question("输入你的修改意见:\n> ")).trim();
  return feedback.length > 0 ? `修改意见：${feedback}` : "修改意见：请继续当前实现并补全细节。";
}

const modelId = process.env.MODEL_ID || "gpt-4.1";
const maxRounds = Number.isFinite(Number(process.env.MAX_ROUNDS)) ? Number(process.env.MAX_ROUNDS) : 8;
const maxProtocolRetries = Number.isFinite(Number(process.env.PROTOCOL_RETRIES))
  ? Number(process.env.PROTOCOL_RETRIES)
  : 2;

const initialInput = (await rl.question("请输入需求描述:\n> ")).trim();
let userInput = initialInput || "实现一个获取天气的 tool";

let state;
const history = [];
let protocolRetryCount = 0;

for (let round = 1; round <= maxRounds; ) {
  console.log(`\n========== Round ${round} ==========`);

  const sections = [];
  let result;
  try {
    result = await runWorkflowRound({
      model: openai(modelId),
      userInput,
      history,
      state,
      systemPrompt: strictSystemPrompt,
      onSection: (section) => {
        sections.push(section);
        printSection(section);
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isProtocolError =
      message.includes("Workflow validation failed") ||
      message.includes("Non-XML") ||
      message.includes("unparsed XML");

    if (!isProtocolError || protocolRetryCount >= maxProtocolRetries) {
      console.error("\n工作流执行失败：", message);
      break;
    }

    protocolRetryCount += 1;
    console.warn(`\n检测到协议格式错误，自动重试（${protocolRetryCount}/${maxProtocolRetries}）...`);
    userInput = `上轮输出不符合 XML 协议，请严格按协议重新输出完整回合，尤其是 questions 必须包含 <item>、<question>、<option>、<allow_manual>true</allow_manual>；如果 questions 后输出 next_action，则必须是 ask_user。\n原始需求：${userInput}`;
    continue;
  }

  protocolRetryCount = 0;

  state = result.state;
  const assistantXml = sections.map((section) => section.raw).join("\n");
  history.push({ role: "user", content: userInput });
  history.push({ role: "assistant", content: assistantXml });

  const nextAction = parseNextAction(findLatestSectionContent(sections, "next_action"));
  const hasImplementationSection = Boolean(findSectionContent(sections, "implementation"));

  if (nextAction === "finalize") {
    console.log("\n工作流已完成（next_action=finalize）。");
    break;
  }

  if (findSectionContent(sections, "questions")) {
    userInput = await answerQuestionsFromSection(findSectionContent(sections, "questions"));
    round += 1;
    continue;
  }

  const intervention = await collectUserIntervention(nextAction, hasImplementationSection);
  if (intervention === null) {
    console.log("\n会话已结束。\n");
    break;
  }

  userInput = intervention;
  round += 1;
}

console.log("\nFinal state:", state);
await rl.close();
