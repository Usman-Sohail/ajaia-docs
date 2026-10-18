# Ajaia Docs

A lightweight collaborative document editor, inspired by Google Docs. You can create rich-text documents, import `.txt` and `.md` files, and share documents with other registered users as **viewers** or **editors**. Everything autosaves to Postgres, with server-enforced access control.

> **Live app:** see [SUBMISSION.md](SUBMISSION.md) for the verified URL and reviewer accounts.

## Features

| Area | What's implemented |
|---|---|
| Auth | Email/password sign-up, sign-in, and sign-out through Supabase Auth. The session persists across reloads. |
| Documents | Create, rename (owner only), delete (owner only, with confirmation), and reopen via a URL (`/d/:id`). Refreshing keeps you on the same document. |
| Editor | TipTap rich text: bold, italic, underline, strikethrough, inline code, H1–H3, bulleted and numbered lists, quotes, and undo/redo (toolbar and keyboard shortcuts). |
| Persistence | Content is stored as TipTap JSON (`jsonb`). Autosave is debounced (800 ms) and shows **Saving / Saved / Unsaved changes / Save failed (Retry)**. |
| Safety | One save at a time, so an older request can't overwrite a newer one. Each document has a version number, and a save from a stale tab gets a conflict banner instead of silently overwriting. Pending edits are flushed when you switch documents, hide the tab, or try to close it. |
| Sharing | The owner shares by email with *Can edit* or *Can view*, changes permissions, and revokes access. Unknown emails get a clear error. The sidebar separates **My documents** from **Shared with me**, and shared documents show the owner and your permission. Viewers get a read-only editor. |
| Import | `.txt` and `.md`/`.markdown` files up to 1 MB. Markdown headings, lists (including nested and task lists), bold/italic/strike/code, links, quotes, and code blocks are preserved. Unsupported, empty, binary, and non-UTF-8 files get specific error messages. |
| Access control | Postgres row-level security on every table, plus triggers for the column-level rules. It's verified by an integration suite against a real database. |
| UX | Sidebar with a title filter, an empty state, loading and error states, toasts, accessible labels, keyboard focus styles, and a responsive slide-over sidebar on small screens. |

## Tech stack

React 19 + TypeScript + Vite 8 · Tailwind CSS v4 · TipTap v3 (ProseMirror) · Supabase (Postgres, Auth, RLS) · `marked` (Markdown lexer only) · Vitest + React Testing Library · Vercel (static SPA hosting).

## Prerequisites

- Node.js **≥ 22.22** (developed on Node 26)
- A Supabase project (the free tier is fine)
- Optional: a Vercel account for deployment

## Local setup

```bash
npm install
cp .env.example .env.local      # then fill in the values below
npm run db:push                 # apply supabase/migrations to your project
npm run seed:reviewers          # optional: two confirmed demo accounts + a shared sample doc
npm run dev                     # http://localhost:5173
```

### Environment variables

| Variable | Where it's used | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | Browser, scripts, and tests. Project URL (`https://<ref>.supabase.co`). | No |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser, scripts, and tests. The publishable key (`sb_publishable_…`) or the legacy `anon` key. | No (it's protected by RLS) |
| `SUPABASE_SECRET_KEY` | **Local scripts and DB tests only.** The secret key (`sb_secret_…`) or the legacy `service_role` key. | **Yes.** Never prefix it with `VITE_` and never deploy it. |
| `SUPABASE_DB_URL` | `npm run db:push`. Use the Supabase → Connect → **Session pooler** URI, because the direct connection is IPv6-only. | **Yes** |
| `REVIEWER_PASSWORD` | `npm run seed:reviewers`. Sets the password for the two reviewer accounts. | **Yes** |

Only the two `VITE_` variables are compiled into the frontend bundle. `.env.local` is gitignored.

### Database setup and migrations

The schema, RLS policies, triggers, and the `share_document` RPC are all in [`supabase/migrations/20261018000000_init.sql`](supabase/migrations/20261018000000_init.sql). Apply it with either of these:

- `npm run db:push`, which wraps `supabase db push --db-url $SUPABASE_DB_URL` and records migration history, **or**
- pasting the file into Supabase → SQL Editor and running it.

### Authentication and test accounts

- **Self sign-up** works from the login page. Supabase hosted projects have *Confirm email* enabled by default, so new users must click the emailed link before signing in, and the built-in mailer is heavily rate-limited. For frictionless review, either turn off Authentication → Providers → Email → *Confirm email*, or use the seeded accounts below.
- **Reviewer accounts:** `npm run seed:reviewers` creates or resets two confirmed accounts, `reviewer1@example.com` and `reviewer2@example.com`, with the password from `REVIEWER_PASSWORD`. It also creates a *Welcome to Ajaia Docs* document owned by reviewer 1 and shared with reviewer 2 as an editor. The script is idempotent. Credentials are deliberately **not** committed. They're given to reviewers out of band (see SUBMISSION.md).
- To test the unrelated-user case, sign up a third account (or add one in Supabase → Authentication → Users → *Add user* with *Auto confirm*).
- In Supabase → Authentication → URL Configuration, set **Site URL** to the deployed URL so confirmation emails link to the right place.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck (`tsc -b`) + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | oxlint |
| `npm test` | Unit and component tests (Vitest + jsdom). No network needed. |
| `npm run test:db` | **RLS integration tests against the real Supabase project.** They create and then delete three throwaway users. Requires `SUPABASE_SECRET_KEY`. |
| `npm run db:push` | Apply migrations |
| `npm run seed:reviewers` | Create or reset the reviewer accounts and the sample doc |

## Testing

- **`npm test`** covers the autosave controller (debounce, serialized saves, no stale overwrite, failure/retry, conflicts, flush on switch), import validation and conversion (all output is validated against the editor's real ProseMirror schema, and HTML and `javascript:` links are neutralised), the import UI's error states, the save indicator, and the editor's formatting round-trip and read-only mode.
- **`npm run test:db`** runs against the live database with real JWTs. It checks that an outsider can't select, update, delete, share, or see profiles; that sharing with an unknown email or with yourself is rejected; that a viewer can read but not write or self-upgrade; that an editor can edit content but can't rename, transfer ownership, delete, or re-share; that stale-version writes are rejected and the version counter can't be tampered with; and that revoking access takes effect immediately.

## Deployment (Vercel + Supabase)

1. Push this repo to GitHub.
2. In Vercel, choose **Add New → Project → Import** for the repo. The framework preset is **Vite**, and `vercel.json` already sets the build command, output directory, and an SPA rewrite so `/d/:id` deep links work.
3. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (Production and Preview). Don't add the secret key.
4. Deploy, then set the Supabase **Site URL** (and add it to Redirect URLs) to the Vercel domain.
5. Verify: open the URL, sign in as reviewer 1, open the shared doc as reviewer 2 in a private window, and confirm a third account can't open its `/d/:id` link.

## Supported file formats

| Format | Extensions | Notes |
|---|---|---|
| Plain text | `.txt` | Blank lines separate paragraphs. Single newlines become line breaks. |
| Markdown | `.md`, `.markdown` | Converted token-by-token into editor JSON. Raw HTML is never rendered: inline tags are dropped, block HTML is kept as literal text, images become their alt text, and only `http(s)`/`mailto` links are kept. Tables become `a \| b` text rows, and headings deeper than H3 become H3. |

The limit is 1 MB of UTF-8 text. DOCX and PDF aren't supported.

## Known limitations

- **No real-time co-editing.** Two editors on the same document get optimistic-concurrency protection (a conflict banner offering *Reload latest* or *Keep my version*), not live merging or presence.
- Editors can change content but not the title. Only owners can rename, delete, or share (documented design choice).
- Sharing reveals whether an email has an account. That's inherent to "show a useful message if the recipient doesn't exist".
- If a user changes their email in Supabase, `profiles.email` isn't updated (there's no update trigger).
- No password reset flow in the UI.
- The editor (TipTap/ProseMirror) is lazy-loaded after sign-in. Initial JS is about 158 KB gzipped, and the editor chunk adds about 152 KB.
- Supabase free-tier projects pause after a week of inactivity.

See [ARCHITECTURE.md](ARCHITECTURE.md) for design details and [AI_WORKFLOW.md](AI_WORKFLOW.md) for how this was built.
