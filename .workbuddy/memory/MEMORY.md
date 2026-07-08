# Project Memory — yomo-tool-coding

## Project Overview
XML-driven workflow engine web app that generates Vivgrid serverless AI Tool code through multi-round LLM conversations. Next.js 16 + Tailwind v4 + TypeScript.

## Tech Stack
- Next.js 16 (Turbopack), Tailwind CSS v4, TypeScript
- CodeMirror for code editing, framer-motion available, lucide-react for icons
- Vercel AI SDK (`ai` package) for LLM streaming
- Vivgrid API for serverless tool deployment

## Key Architecture
- `src/types/` — type definitions (workflow.ts for engine, ui.ts for frontend)
- `src/lib/` — utilities (utils.ts for cn(), workflow-utils.tsx, constants.tsx, codemirror.ts)
- `src/components/` — UI components split by domain (ui, layout, conversation, analysis, code, deploy)
- `src/app/page.tsx` — 538-line orchestration layer (was 1632 lines before refactor)
- `src/engine.ts`, `src/state-machine.ts`, `src/xml-protocol.ts` — workflow engine
- `src/vivgrid/` — Vivgrid platform client
- API routes: `/api/generate`, `/api/deploy`, `/api/deploy-review`

## Design System (Vivgrid Alchemist Style)
- Primary: emerald green `hsl(160 84% 39%)`
- Light theme: near-white background, white cards
- Fonts: Inter (sans) + JetBrains Mono (code)
- Semantic CSS variables in globals.css

## Build
- `NODE_OPTIONS="" npm run build` — must clear NODE_OPTIONS due to env conflict
- Dev: `NODE_OPTIONS="" npm run dev` → http://localhost:3000
