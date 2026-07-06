# yomo-tool-coding

An XML-driven workflow engine and web app for generating YoMo tools.

It provides three core capabilities:

- Enforces structured XML output with a strict workflow prompt
- Parses XML sections from a streaming model response in real time
- Validates workflow order and rules with a state machine

## Workflow Stages

- `requirement_review`
- `questions` (when required information is missing)
- `implementation`
- `code`
- `review` (`PASS` / `FAIL`)
- `next_action` (`ask_user` / `revise_code` / `finalize`)

## Recommended Flow

- Collect requirement details first: goals, scope, I/O, error handling, security constraints, and acceptance criteria.
- Start with `requirement_review`; if information is incomplete, stop at `questions` and do not generate code yet.
- Once requirements are sufficient, generate `implementation` (file changes, core logic, edge-case strategy).
- Generate `code` with `path` and `lang` attributes.
- After every code output, generate `review`; on `FAIL`, include `failed_checks`, `reasons`, and `fix_instructions`.
- End each round with `next_action`.

## Web App Usage

Run the web UI locally:

```bash
npm install
OPENAI_API_KEY=your_key npm run dev
```

Vivgrid-hosted endpoint example:

```bash
VIVGRID_BASE_URL=https://hosting.vivgrid.com OPENAI_API_KEY=viv-xxxx OPENAI_BASE_URL=https://api.vivgrid.com/v1 MODEL_ID=gpt-5.4 MAX_ROUNDS=10 npm run dev
```

Then open `http://localhost:3000`.

Optional environment variables:

- `OPENAI_BASE_URL`: custom endpoint or proxy
- `MODEL_ID`: model override (default is configured in the API route)

Production build:

```bash
npm run build
npm run start
```

## CLI Demo

Run the interactive demo:

```bash
OPENAI_API_KEY=your_key npm run demo
# optional: custom endpoint/proxy
OPENAI_API_KEY=your_key OPENAI_BASE_URL=https://api.vivgrid.com/v1 npm run demo
# optional: model and max rounds
OPENAI_API_KEY=your_key MODEL_ID=gpt-4.1 MAX_ROUNDS=10 npm run demo
# optional: protocol auto-retry count
OPENAI_API_KEY=your_key PROTOCOL_RETRIES=3 npm run demo
```

The demo is a multi-round interactive CLI. After each XML round, you can:

- Provide revision feedback
- Select an implementation direction
- End the session

You only need to enter the initial requirement once. If `questions` are generated, the demo will collect answers and continue to the next round.

## Prompt File

You can use the predefined prompt directly:

- `prompts/node-tool-workflow.md`

Or generate it dynamically at runtime with `buildWorkflowPrompt()`.

## Vivgrid Tool API Client (Server-side)

This package now includes a server-side client that wraps these endpoints:

- `build` (SSE)
- `create`
- `status`
- `logs` (SSE)
- `invoke`
- `remove`

### Quick Example

```ts
import { VivgridToolClient } from "yomo-tool-coding";

const client = new VivgridToolClient({
  baseUrl: "http://127.0.0.1:9040",
});

const token = "your_vivgrid_token";

for await (const evt of client.buildToolFromFiles({
  toolName: "get-weather",
  token,
  language: "auto",
  files: {
    "package.json": JSON.stringify({ name: "get-weather", version: "1.0.0", type: "module" }, null, 2),
    "src/app.ts": "export const description = 'weather tool';\nexport type Argument = { city: string };\n",
    // tsconfig.json is auto-injected if not provided
  },
})) {
  console.log(evt.event, evt.data);
}

await client.createTool({
  toolName: "get-weather",
  token,
  envs: { MY_ENV: "abc" },
});

const status = await client.getToolStatus({ toolName: "get-weather", token });
const result = await client.invokeTool({ toolName: "get-weather", token, args: { city: "Beijing" } });
await client.removeTool({ toolName: "get-weather", token });
```

Notes:

- `VIVGRID_TOKEN` is passed as a per-method parameter (`token`), not read from env by the client.
- `buildToolFromFiles()` creates ZIP in memory and uploads it as `zip_file` without writing local temp files.
- If code uses env vars, include `.env.viv` in `files`.
