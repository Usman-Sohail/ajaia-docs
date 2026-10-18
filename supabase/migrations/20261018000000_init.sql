-- Ajaia Docs — initial schema, row-level security, and sharing RPC.
--
-- Access model
--   owner  : full control (read, edit, rename, delete, manage shares)
--   editor : read + edit content (cannot rename, delete, or share)
--   viewer : read only
--
-- RLS helpers live in the unexposed `private` schema and are SECURITY DEFINER so
-- that documents ↔ document_shares policies never recurse into each other.

create schema if not exists private;
grant usage on schema private to authenticated;

-- ─── Profiles ────────────────────────────────────────────────────────────────
-- Mirror of auth.users exposing only what the app needs (email for sharing UI).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  created_at timestamptz not null default now()
);

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ─── Documents ───────────────────────────────────────────────────────────────

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null default 'Untitled document'
    check (char_length(btrim(title)) between 1 and 200),
  -- TipTap / ProseMirror JSON document.
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb
    check (jsonb_typeof(content) = 'object' and content ->> 'type' = 'doc'),
  -- Incremented on every content change; used for optimistic concurrency.
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_owner_updated_idx on public.documents (owner_id, updated_at desc);

-- ─── Shares ──────────────────────────────────────────────────────────────────

create table public.document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  shared_with_user_id uuid not null references public.profiles (id) on delete cascade,
  permission text not null check (permission in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  unique (document_id, shared_with_user_id)
);

-- (document_id, …) lookups are served by the unique index above.
create index document_shares_recipient_idx on public.document_shares (shared_with_user_id);

-- ─── RLS helper functions ────────────────────────────────────────────────────

create function private.is_document_owner(doc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = doc_id and d.owner_id = (select auth.uid())
  );
$$;

-- True when the current user has a share on the document
-- (any share when require_edit is false, an editor share when true).
create function private.has_document_share(doc_id uuid, require_edit boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.document_shares s
    where s.document_id = doc_id
      and s.shared_with_user_id = (select auth.uid())
      and (not require_edit or s.permission = 'editor')
  );
$$;

-- True when the current user and other_user are connected by a share
-- (in either direction). Lets users see each other's email, nothing more.
create function private.shares_document_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.document_shares s
    join public.documents d on d.id = s.document_id
    where (d.owner_id = (select auth.uid()) and s.shared_with_user_id = other_user)
       or (s.shared_with_user_id = (select auth.uid()) and d.owner_id = other_user)
  );
$$;

revoke all on function private.is_document_owner(uuid) from public;
revoke all on function private.has_document_share(uuid, boolean) from public;
revoke all on function private.shares_document_with(uuid) from public;
grant execute on function private.is_document_owner(uuid) to authenticated;
grant execute on function private.has_document_share(uuid, boolean) to authenticated;
grant execute on function private.shares_document_with(uuid) to authenticated;

-- ─── Integrity triggers ──────────────────────────────────────────────────────
-- RLS is row-level; these enforce the column-level rules for end-user requests:
-- nobody may transfer ownership, and only the owner may rename.

create function private.documents_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Document ownership cannot be changed' using errcode = '42501';
    end if;
    if new.title is distinct from old.title and old.owner_id <> (select auth.uid()) then
      raise exception 'Only the document owner can rename it' using errcode = '42501';
    end if;
  end if;

  new.created_at := old.created_at;
  new.updated_at := now();
  if new.content is distinct from old.content then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  return new;
end;
$$;

create trigger documents_before_update
  before update on public.documents
  for each row execute function private.documents_before_update();

create function private.documents_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := 1;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create trigger documents_before_insert
  before insert on public.documents
  for each row execute function private.documents_before_insert();

-- ─── Row-level security ──────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_shares enable row level security;

-- Anonymous visitors get nothing (defence in depth on top of RLS).
revoke all on public.profiles, public.documents, public.document_shares from anon;

-- profiles: read-only, and only yourself or people you share documents with.
create policy "profiles: read self and share partners"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_document_with(id));

-- documents
create policy "documents: owner or shared user can read"
  on public.documents for select to authenticated
  using (owner_id = (select auth.uid()) or private.has_document_share(id, false));

create policy "documents: users create their own"
  on public.documents for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "documents: owner or editor can update"
  on public.documents for update to authenticated
  using (owner_id = (select auth.uid()) or private.has_document_share(id, true))
  with check (owner_id = (select auth.uid()) or private.has_document_share(id, true));

create policy "documents: owner can delete"
  on public.documents for delete to authenticated
  using (owner_id = (select auth.uid()));

-- document_shares: owner manages; recipient can see their own share.
create policy "shares: owner or recipient can read"
  on public.document_shares for select to authenticated
  using (shared_with_user_id = (select auth.uid()) or private.is_document_owner(document_id));

create policy "shares: owner can add"
  on public.document_shares for insert to authenticated
  with check (
    private.is_document_owner(document_id)
    and shared_with_user_id <> (select auth.uid())
  );

create policy "shares: owner can change permission"
  on public.document_shares for update to authenticated
  using (private.is_document_owner(document_id))
  with check (private.is_document_owner(document_id));

create policy "shares: owner can revoke"
  on public.document_shares for delete to authenticated
  using (private.is_document_owner(document_id));

-- ─── Sharing RPC ─────────────────────────────────────────────────────────────
-- Resolves a recipient by email (auth.users / profiles are not readable by the
-- client) and upserts the share. Raises explicit, user-presentable errors.

create function public.share_document(p_document_id uuid, p_email text, p_permission text)
returns public.document_shares
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient uuid;
  v_share public.document_shares;
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in to share documents' using errcode = '42501';
  end if;

  if p_permission is null or p_permission not in ('viewer', 'editor') then
    raise exception 'Permission must be "viewer" or "editor"' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.documents
    where id = p_document_id and owner_id = (select auth.uid())
  ) then
    raise exception 'Only the document owner can share it' using errcode = '42501';
  end if;

  select id into v_recipient
  from public.profiles
  where email = lower(btrim(p_email));

  if v_recipient is null then
    raise exception 'No Ajaia Docs account uses that email. Ask them to sign up first.'
      using errcode = 'P0002';
  end if;

  if v_recipient = (select auth.uid()) then
    raise exception 'You already own this document' using errcode = '22023';
  end if;

  insert into public.document_shares (document_id, shared_with_user_id, permission)
  values (p_document_id, v_recipient, p_permission)
  on conflict (document_id, shared_with_user_id)
    do update set permission = excluded.permission
  returning * into v_share;

  return v_share;
end;
$$;

revoke all on function public.share_document(uuid, text, text) from public, anon;
grant execute on function public.share_document(uuid, text, text) to authenticated;
