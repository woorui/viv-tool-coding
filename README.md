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
