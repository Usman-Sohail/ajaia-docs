# Architecture

## Overview

```
Browser (React SPA on Vercel)                         Supabase
┌──────────────────────────────────────┐        ┌───────────────────────────────┐
│ pages/      LoginPage, WorkspacePage │        │ Auth (email + password, JWT)  │
│ components/ Sidebar, DocumentView,   │  HTTPS │                               │
│             DocumentEditor, Toolbar, │ ─────▶ │ PostgREST ──▶ Postgres         │
│             ShareDialog, ImportButton│  JWT   │   RLS policies + triggers     │
│ hooks/      useDocumentList,         │        │   private.* helper functions  │
│             useDocumentAutosave      │        │   public.share_document() RPC │
│ lib/        documents.ts (data API)  │        └───────────────────────────────┘
│             autosave.ts (controller) │
│             import/ (validate, md→JSON)
└──────────────────────────────────────┘
```

There is no custom backend server. The browser talks to Supabase with the **publishable key and the user's JWT**, and **Postgres row-level security is the authorization layer**. That means every rule holds no matter which client calls the API. The UI only mirrors the rules for usability (it hides the Share button from non-owners and makes the editor read-only for viewers).

Code is layered on purpose:

- `lib/` is framework-free logic. Data access, autosave, and import live here and are unit tested in isolation.
- `hooks/` binds that logic to React lifecycles.
- `components/` and `pages/` are presentation.

All database calls live in `lib/documents.ts`. No component calls `supabase.from(...)` directly.

## Database schema

```
auth.users ──1:1──▶ profiles(id, email)
                       ▲            ▲
          owner_id ────┘            └──── shared_with_user_id
documents(id, owner_id, title, content jsonb, version, created_at, updated_at)
    ▲
    └── document_id ── document_shares(id, document_id, shared_with_user_id,
                                       permission ∈ {viewer, editor}, created_at)
                                       UNIQUE(document_id, shared_with_user_id)
```

- **`profiles`** is filled by a trigger on `auth.users` insert. It exists because the client can't read `auth.users`, and the UI needs emails (who owns this doc, who it's shared with).
- **Indexes:** `documents(owner_id, updated_at desc)` for the sidebar, `document_shares(shared_with_user_id)` for "shared with me", and the unique `(document_id, shared_with_user_id)` index for per-document lookups. It also makes sharing an idempotent upsert.
- **Cascades:** deleting a user removes their profile, documents, and shares. Deleting a document removes its shares.
- **Checks:** a title is 1–200 characters after trimming, `content` must be a JSON object with `type = 'doc'`, and `permission` must be `viewer` or `editor`.

## Authentication and authorization

| Action | Owner | Editor | Viewer | Anyone else |
|---|:-:|:-:|:-:|:-:|
| Read document | ✅ | ✅ | ✅ | ❌ |
| Edit content | ✅ | ✅ | ❌ | ❌ |
| Rename | ✅ | ❌ | ❌ | ❌ |
| Delete | ✅ | ❌ | ❌ | ❌ |
| Share / change / revoke | ✅ | ❌ | ❌ | ❌ |

How it's enforced:

1. **RLS policies** (`to authenticated`) on all three tables. `anon` also has its table privileges revoked as an extra layer.
   - `documents`: select needs `owner_id = auth.uid()` or any share. Update needs the owner or an *editor* share. Insert needs `owner_id = auth.uid()`. Delete is owner only.
   - `document_shares`: the owner of the document manages all rows. A recipient can read only their own row.
   - `profiles`: you can read your own row and the rows of people you share a document with, in either direction. Nobody can list all users.
2. **Avoiding recursive policies.** The documents policy checks shares, and the shares policy checks document ownership. Inline subqueries would recurse through each other's RLS. Instead, both use small `SECURITY DEFINER` helpers in an unexposed `private` schema (`is_document_owner`, `has_document_share`, `shares_document_with`). Each one has a fixed `search_path` and a one-line `EXISTS` query.
3. **Column rules via a trigger.** RLS is row-level, so an editor who may update a row could also change `title` or `owner_id`. A `BEFORE UPDATE` trigger rejects ownership changes and renames by non-owners with `42501`. The same trigger maintains `version`/`updated_at` so clients can't tamper with them.
4. **Sharing by email** goes through `share_document(doc, email, permission)`, a `SECURITY DEFINER` RPC. It checks that the caller owns the document, looks up the recipient by lower-cased email, raises `P0002` for unknown accounts and `22023` for sharing with yourself, and upserts the share. Execute permission is revoked from `anon`.

These rules are verified by `tests/db/rls.test.ts` against a real project, using three real users.

## Rich-text storage

Documents are stored as **TipTap/ProseMirror JSON** in a `jsonb` column, not HTML. That has three benefits:

- it round-trips formatting losslessly,
- it can't carry scripts,
- it's validated by the editor schema on load.

The editor configuration (`lib/editor/extensions.ts`) is shared by the editor, the importer, and the tests, so the importer's output is checked against the exact schema the editor uses.

## Autosave

`lib/autosave.ts` is a framework-free `AutosaveController`:

- **Debounce.** Edits are coalesced, and the latest JSON is saved 800 ms after typing stops.
- **Serialization.** At most one request is in flight. Edits made during a save are queued for a follow-up save, so an older response can never land after a newer one.
- **Honest status.** *Saved* appears only after the latest value is confirmed by the server. A failure keeps the value, shows *Save failed* with *Retry*, and is retried on the next edit.
- **Optimistic concurrency.** Each save is `UPDATE … WHERE id = $1 AND version = $expected`, and the trigger bumps `version` when content changes. If zero rows are updated, a follow-up read tells *conflict* (another tab or collaborator saved first) apart from *lost access*. On a conflict, autosave pauses and a banner offers *Reload latest* or *Keep my version* (adopt the server version, then overwrite).
- **Switching documents.** `DocumentView` is keyed by document id, so switching unmounts it. The hook's cleanup flushes pending edits to the document they belong to, and a toast is shown if that flush fails. Pending edits are also flushed when the tab is hidden, and `beforeunload` warns if anything is unsaved.

Renaming is a separate, explicit save (on blur or Enter). It doesn't touch `version`, so a rename never conflicts with content saves.

## File import

```
<input type=file> → validateImportFile (extension, 0 < size ≤ 1 MB)
                  → decodeText (strict UTF-8, reject NUL bytes and whitespace-only files, strip BOM)
                  → .txt: textToDoc        .md: markdownToDoc (marked.lexer → TipTap JSON)
                  → createDocument (persisted, owned by the current user) → navigate to /d/:id
```

The Markdown converter walks marked's **token stream** directly into editor JSON. Because HTML is never produced, uploaded content can't inject markup:

- inline HTML tags are dropped,
- block HTML becomes literal text,
- images become their alt text,
- links survive only for `http(s)`/`mailto`.

The converter never creates empty text nodes, which ProseMirror rejects. Every error is an `ImportError` with a message the user can act on.

## Key tradeoffs

| Decision | Why | Cost |
|---|---|---|
| Supabase + RLS, no custom API server | Authorization lives with the data and is enforced for every client. Less code and infrastructure to deploy in a 4-hour build. | Business rules are split between SQL and TypeScript. Complex rules need SQL fluency. |
| Optimistic concurrency instead of real-time collaboration (CRDT/Yjs) | Prevents silent lost updates with about 20 lines of code. Real-time sync with presence is a multi-day feature to do properly. | Two simultaneous editors see a conflict banner instead of merged edits. |
| Editors can't rename | Matches the brief ("only owners rename/delete/share"). A trigger enforces it simply. | Slightly less flexible for collaborators. |
| Token-based Markdown import instead of `marked → HTML → sanitize` | No HTML anywhere means no sanitizer to configure, plus deterministic, testable output. | Unsupported constructs (tables) are flattened to text. |
| `profiles` table plus an RPC for email lookup | Emails are visible only between share partners, and lookup happens server-side. | The RPC necessarily confirms whether an email has an account. |
| Untyped Supabase client with explicit row types | No dependency on `supabase gen types` (needs CLI login) during the timed build. | Row shapes are cast by hand in one file (`documents.ts`). Generated types are an easy follow-up. |
