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
