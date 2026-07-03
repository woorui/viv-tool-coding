# yomo-tool-coding

独立的 Node Tool 编码工作流引擎。

它做三件事：

- 用固定 prompt 约束模型输出 XML 分段
- 流式解析 XML 段落并实时回调给前端
- 用状态机校验顺序与规则（问题补充、代码、评审、重试）

## 工作流

- `requirement_review`
- `questions`（信息不足时）
- `implementation`
- `code`
- `review`（`PASS` / `FAIL`）
- `next_action`（`ask_user` / `revise_code` / `finalize`）

## 标准流程（推荐）

- 先收集需求输入：业务目标、边界、输入输出、错误处理、安全约束、验收标准。
- 先做 `requirement_review`，信息不完整时只走 `questions`，不直接写代码。
- 需求完整后输出 `implementation`（改动文件、核心逻辑、边界与错误策略）。
- 再输出 `code`（带 `path`、`lang`），并遵守 Node Tool 规范与安全约束。
- 每轮代码后必须 `review`，`FAIL` 时必须给出 `failed_checks/reasons/fix_instructions`。
- 最后输出 `next_action`：`ask_user` / `revise_code` / `finalize`。

## 快速使用

```ts
import {
  runWorkflowRound,
  type XmlSection,
} from "./dist/index.js";
import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const result = await runWorkflowRound({
  model: openai("gpt-4.1"),
  userInput: "实现一个 Node Tool，根据公开查询条件获取用户资料",
  onSection: (section: XmlSection) => {
    console.log(section.name, section.attrs);
  },
});

console.log(result.state, result.sections.length);
```

## Prompt 文件

可直接使用：`prompts/node-tool-workflow.md`

也可以在运行时调用 `buildWorkflowPrompt()` 生成动态 prompt。

## Demo

```bash
npm run build
OPENAI_API_KEY=your_key npm run demo
# optional: use a custom endpoint/proxy
OPENAI_API_KEY=your_key OPENAI_BASE_URL=https://your-proxy/v1 npm run demo
# optional: choose model and max rounds
OPENAI_API_KEY=your_key MODEL_ID=gpt-4.1 MAX_ROUNDS=10 npm run demo
# optional: adjust protocol auto-retry count
OPENAI_API_KEY=your_key PROTOCOL_RETRIES=3 npm run demo
```

`npm run demo` 是一个交互式 CLI，会在每轮输出 XML section 后让你：

- 添加修改意见
- 选择实现方式
- 或结束会话

demo 启动时只需输入一段需求描述；出现 `questions` 时会逐题收集你的回答再进入下一轮。
