# TODO - Automatic tsc Validation and Regeneration

## Goal

After each generated `code` section, run TypeScript compilation checks automatically. If validation fails, trigger one automatic regeneration round with the reported errors.

## Scope

- Trigger timing: run `tsc` after every round that outputs `code`.
- Auto-retry limit: 1 retry maximum.
- On failure: inject a concise error summary into the next regeneration prompt.
- If the retry still fails: stop auto-regeneration and expose the errors to the frontend.

## Task Breakdown

### 1) API Validation Control Flow

- [ ] Add post-code `tsc` validation flow to `src/app/api/generate/route.ts`.
- [ ] Keep current SSE compatibility (`chunk/state/section/done`).
- [ ] Trigger one automatic regeneration when validation fails.
- [ ] Stop automation and return errors if retry still fails.

### 2) tsc Validation Module

- [ ] Add `src/tsc-check.ts`.
- [ ] Write round `code` sections into a temporary directory (by `path`).
- [ ] Generate a minimal `tsconfig.json` and run `npx tsc --noEmit --pretty false`.
- [ ] Return a structured result:
  - [ ] `passed: boolean`
  - [ ] `errors: Array<{ file?: string; line?: number; column?: number; code?: string; message: string }>`
  - [ ] `rawOutput: string`
- [ ] Clean temporary files after each validation run.

### 3) Auto-Regeneration Prompt Template

- [ ] Build internal regeneration instructions in `route.ts`:
  - [ ] Clearly mark this as an automatic retry due to `tsc` failure.
  - [ ] Include key error summary (prefer file/line/code/message).
  - [ ] Require fixing compile errors without changing business intent.

### 4) Frontend Status Display (Optional but Recommended)

- [ ] Add support in `src/app/page.tsx` for new events:
  - [ ] `tsc_check` (`start/pass/fail`)
  - [ ] `auto_retry` (automatic regeneration in progress)
- [ ] Show readable error details when retries are exhausted.

### 5) Validation and Regression

- [ ] Confirm auto-`tsc` runs on every round containing `code`.
- [ ] Use a guaranteed TypeScript failure case to verify one auto-retry.
- [ ] Verify behavior when retry still fails (stop + show errors).
- [ ] Run `npx tsc --noEmit --incremental false`.
- [ ] Run `npm run build`.

## Acceptance Criteria

- [ ] TypeScript validation runs after every generated `code` round.
- [ ] First validation failure triggers one automatic retry.
- [ ] If retry still fails, automation stops and errors are surfaced.
- [ ] Existing XML streaming and three-panel UI behavior remains intact.
