# AI Workflow

How this project was built in the 240-minute window, written from the actual session.

## Tools used

| Tool | Role |
|---|---|
| **Claude Code** (Claude Opus 5.5, VS Code extension) | Planning, implementation, tests, debugging, docs, Git and GitHub operations |
| **Playwright MCP** (driven by Claude Code) | Browser verification against the real Supabase project: three users, offline simulation, conflict simulation, screenshots |
| `npm view`, Supabase CLI (`npx supabase db push`), `gh` CLI | Checking package versions, applying migrations, creating the repo |
| Me (the engineer) | Wrote the structured brief, made the product and infrastructure decisions, created the Supabase, GitHub, and Vercel accounts and credentials, and reviewed the output |

No other AI tools were used.

## Process

1. **Inspect, then plan, before writing code.** Claude Code inspected the environment first:
   - an empty directory, Node 26, no Docker daemon, no logged-in Supabase, Vercel, or GitHub CLIs,
   - the current versions of every candidate package.

   It then wrote a plan: P0–P4 milestones with time boxes, the riskiest dependencies (Supabase credentials, IPv6-only DB connections, RLS recursion, autosave races), and an explicit **cut list** (search, then the conflict check, then the remove-share UI, then delete, then Markdown import).
2. **Three human decisions were requested up front.** These were hosted Supabase vs. local Docker, how to deploy, and where the source lives. Everything else was decided by the AI and documented here or in ARCHITECTURE.md.
3. **Work went in small milestones.** The order was: schema and RLS, then the framework-free core (`autosave.ts`, `import/*`, each with unit tests written and run immediately), then UI, then the live-database tests, then browser verification, then docs. Each milestone was committed separately.
4. **Infrastructure-free work ran in parallel.** The whole UI, the test suites, the README, and ARCHITECTURE were finished while waiting for credentials. The live-DB suite was written in advance and passed on its first run once credentials arrived.

## Where AI materially accelerated the work

- **Boilerplate-heavy but precise code:** the RLS migration (policies, `SECURITY DEFINER` helpers, triggers, sharing RPC), the full component set, and the 19-case RLS suite.
- **Checking current APIs instead of relying on memory.** `npm view` showed TypeScript `latest` is the 7.0 native port, so we kept the template's TS 6.0. react-router v8's exports were inspected before use. postgrest-js's `.returns()` was found to be deprecated. The real token output of the `marked` lexer was dumped before writing the converter, which revealed separate inline-HTML tokens, `checkbox` tokens, and undecoded entities.
- **Browser QA that's normally tedious:** three-account sharing flows, offline save failures, a simulated concurrent edit, the flush on document switch, viewer mode, and the mobile layout. Each was checked against the real database, often by reading the server row back with the admin client.

## AI output that was changed or rejected

| What | What happened |
|---|---|
| First draft of `AutosaveController` | On self-review before any test ran, it had two bugs. (1) If `save()` threw synchronously, `inFlight` was cleared *before* it was assigned, so `flush()` would loop forever. (2) Continuous typing during a slow save bypassed the debounce. It was rewritten so a `.finally()` wrapper owns `inFlight`, the timer path debounces, and the explicit flush loops. A regression test for the synchronous throw was added. |
| `@tailwindcss/typography` | Added, then removed. It was an unnecessary dependency that brought a moderate audit warning, and about 60 lines of CSS do the job. |
| `marked → HTML → sanitizer` for import | Rejected in favour of walking marked's token stream directly into TipTap JSON. With no HTML anywhere there's no sanitizer to get wrong, and every output is schema-validated in tests. |
| `.returns<T>()` and typed casts | Deprecated, so they were replaced. Then `tsc` showed postgrest infers embedded many-to-one relations as arrays without generated types. That's handled with documented `as unknown as` casts in a single file. |
| Probing Supabase pooler regions to fix the IPv6-only DB URL | Blocked by Claude Code's safety classifier. The user was asked for the session-pooler URL instead (the correct outcome). |
| Installing `supabase/agent-skills` mid-session (requested by me) | Blocked by the same classifier, because it installs third-party code into the agent config. Not done; left for me to run manually. |
| Lint warnings | `set-state-in-effect` in `DocumentView` was fixed. Four warnings remain and are deliberately left alone: a `react(refs)` false positive (refs are read only inside the async save callback), one `set-state-in-effect` on the standard fetch-on-mount pattern, and two `only-export-components` on context+hook files. Lint wasn't disabled. |
| A test broken by the friendlier network-error mapping | Its sample error ("Network request failed") now correctly maps to the friendly message. The test was changed to use a non-network error, since its intent is "persistence errors reach the user". |
| A suspected autosave bug in a screenshot ("Unsaved changes" after 2 s) | Measured rather than "fixed": 800 ms debounce, then about 475 ms round trip to the Sydney project, then *Saved*. The lingering status was a correct serialized follow-up save. No code change. |
| A jsdom crash (`elementFromPoint`) in editor tests | Fixed with a test-environment shim in `src/test/setup.ts`, not by changing app code. |

## How correctness was verified

**Automated**
- `npm test`: **40/40 passing** across 6 files.
  - Autosave: debounce, no concurrent saves or stale overwrites, never "Saved" on failure, retry, flush, conflict halt and resume, synchronous throw.
  - Import: validation, UTF-8 and binary checks, Markdown fidelity, HTML and `javascript:` neutralisation, schema validity.
  - UI: import error states, the save indicator, editor formatting round-trip, read-only mode.
  - Error messages.
- `npm run test:db`: **19/19 passing against the live Supabase project**, using real JWTs and three throwaway users.
  - Outsider: denied select, update, delete, share, and profile reads.
  - Unknown-email and self shares are rejected.
  - Viewer: can read, can't write or self-upgrade.
  - Editor: can edit content; can't rename, transfer, delete, or re-share.
  - Stale-version writes are rejected, `version` can't be tampered with, and revocation is immediate.
- `npm run build` (typecheck + Vite build) succeeds. `npm run lint` shows 0 errors and 4 warnings (explained above).

**Manual, via Playwright against the real database** (local dev server, Chromium). Screenshots are in `docs/screenshots/`.
- Sign-in and redirects. Create, rename, and format (H1, bold, underline, list). Undo.
- **A hard reload preserves the title and all formatting.**
- `.md` import produces an open, persisted document with structure preserved, `<script>` rendered as inert text, and inline HTML dropped. `.txt` with an empty file shows an error toast and creates no document.
- Sharing with an unknown email shows an error. Sharing with the second user as an editor works; they see it under *Shared with me*, edit it, and the edit persists. The title is read-only for them and Share/Delete are hidden.
- **Third user opening the direct URL sees "Document unavailable".**
- Offline gives *Save failed* with Retry (never *Saved*). Back online, Retry gives *Saved*.
- A concurrent write (admin client, version 9 → 10) followed by typing in the stale tab shows a conflict banner, and autosave halts. The server row is unchanged. *Keep my version* then saves version 11 with all local edits.
- Typing and switching documents within the debounce window lands the edit in the correct document (v12). The other document is untouched.
- After downgrading to viewer: the sidebar shows *View only*, `contenteditable=false`, and the toolbar is disabled.
- At 390 px wide there's no horizontal overflow, and the slide-over sidebar works.

## Remaining uncertainties

- **The deployed URL check is tracked in SUBMISSION.md.** The local checks above ran against the same production database.
- Only Chromium was tested. Safari and Firefox weren't.
- Concurrency was tested with a simulated second writer (admin client), not two simultaneous browser sessions.
- The email-confirmation sign-up flow wasn't tested end to end, because there was no test inbox. The reviewer accounts are pre-confirmed via the admin API.
- No load or performance testing. The editor is lazy-loaded (about 158 KB gzipped initial JS, plus a 152 KB editor chunk).
