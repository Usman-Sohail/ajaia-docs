# Submission: Ajaia Docs

| Item | Location / status |
|---|---|
| Source code | https://github.com/Usman-Sohail/ajaia-docs |
| Live product | **https://ajaia-docs-dusky.vercel.app** (Vercel, auto-deployed from `main`; backend on Supabase) |
| Walkthrough video | See [`WALKTHROUGH_URL.txt`](WALKTHROUGH_URL.txt) (**not yet recorded**) |
| README (setup, env vars, commands, deployment) | [`README.md`](README.md) |
| Architecture notes | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| AI workflow note | [`AI_WORKFLOW.md`](AI_WORKFLOW.md) |
| Database schema + RLS | [`supabase/migrations/20261018000000_init.sql`](supabase/migrations/20261018000000_init.sql) |
| Screenshots | [`docs/screenshots/`](docs/screenshots) (captured during browser verification) |
| Sample import files | [`docs/samples/`](docs/samples): `product-brief.md`, `meeting-notes.txt`, `empty.txt` (the last one tests the error) |

## Reviewer access

Two pre-confirmed accounts (created with `npm run seed:reviewers`):

| Account | Email | Starts with |
|---|---|---|
| Reviewer 1 | `reviewer1@example.com` | Owns "Welcome to Ajaia Docs", shared with reviewer 2 as an editor |
| Reviewer 2 | `reviewer2@example.com` | Sees that document under *Shared with me* |

**Password:** provided separately with the submission. It's intentionally not committed to the repository.

To test the unrelated-user case, register a third account from the sign-in page. Then paste the URL of a document you didn't share with it (e.g. `/d/<id>` copied from reviewer 1's address bar). It shows *Document unavailable*.

### Suggested 5-minute review path
1. Sign in as reviewer 1, open *Welcome to Ajaia Docs*, format some text, and refresh. The formatting persists.
2. Import `docs/samples/product-brief.md` and check that the headings, lists, and links survive.
3. Share a document with reviewer 2 as *Can view*.
4. In a private window, sign in as reviewer 2. The document appears under *Shared with me* and is read-only. The welcome doc is editable.
5. Optional: change one document in two tabs. The second tab shows a conflict banner instead of overwriting.

## Test results (at time of writing)

| Suite | Command | Result |
|---|---|---|
| Unit + component (jsdom) | `npm test` | **41 / 41 passed** |
| RLS integration (live Supabase, real JWTs) | `npm run test:db` | **19 / 19 passed** |
| Typecheck + production build | `npm run build` | **Succeeds** |
| Lint | `npm run lint` | 0 errors, 4 warnings (explained in AI_WORKFLOW.md) |

### Verified on the live URL (Playwright, Chromium)
- Opening `/d/<id>` signed-out redirects to sign-in, which confirms the SPA rewrite and the auth guard.
- Owner: create, rename, and **bold** text, then a hard reload. The same URL keeps its title and formatting.
- A `.txt` import becomes a persisted, editable document that survives a reload.
- Sharing as *Can view* works: the second user sees it under *Shared with me · View only*, and the editor isn't editable.
- **A third, unrelated user opening the document URL gets *Document unavailable*.**

The full manual verification list is in [AI_WORKFLOW.md](AI_WORKFLOW.md#how-correctness-was-verified).

## Incomplete features / known issues

- **No real-time co-editing or presence.** Concurrent edits are protected by optimistic versioning (a conflict banner), not merged.
- Editors can't rename (by design: only the owner renames, deletes, and shares).
- No password reset UI. Changes to a user's email aren't synced into `profiles`.
- Sharing confirms whether an email has an account (inherent to the required "useful message" for unknown recipients).
- Markdown tables are flattened to text rows. Headings deeper than H3 become H3. No DOCX or PDF import.
- Tested in Chromium only.
