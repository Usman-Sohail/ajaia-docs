/**
 * Row-level-security integration tests against a REAL Supabase project.
 *
 * Creates three throwaway users (owner, collaborator, outsider) with the secret key,
 * then exercises the public API exactly as the browser does (publishable key + user JWT).
 * Everything is deleted afterwards (profiles → documents → shares cascade).
 *
 * Run: npm run test:db   (needs VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY)
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadLocalEnv, requireEnv } from '../../scripts/env'

loadLocalEnv()
const url = requireEnv('VITE_SUPABASE_URL')
const publishableKey = requireEnv('VITE_SUPABASE_PUBLISHABLE_KEY')
const admin = createClient(url, requireEnv('SUPABASE_SECRET_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

interface TestUser {
  id: string
  email: string
  client: SupabaseClient
}

const runId = randomUUID().slice(0, 8)
const password = `Rls-${randomUUID()}`
const created: string[] = []

async function makeUser(role: string): Promise<TestUser> {
  const email = `rls-${role}-${runId}@example.com`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  created.push(data.user.id)
  const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  return { id: data.user.id, email, client }
}

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

let owner: TestUser
let collaborator: TestUser
let outsider: TestUser
let docId: string

/** Reads the document with the admin client (bypasses RLS) to check what really happened. */
async function actual() {
  const { data, error } = await admin.from('documents').select('title, content, owner_id, version').eq('id', docId).single()
  if (error) throw error
  return data
}

beforeAll(async () => {
  ;[owner, collaborator, outsider] = await Promise.all([makeUser('owner'), makeUser('collab'), makeUser('outsider')])
  const { data, error } = await owner.client
    .from('documents')
    .insert({ owner_id: owner.id, title: 'Quarterly plan', content: doc('secret plan') })
    .select('id, version')
    .single()
  if (error) throw error
  docId = data.id
  expect(data.version).toBe(1)
})

afterAll(async () => {
  await Promise.all(created.map((id) => admin.auth.admin.deleteUser(id)))
})

describe('documents: ownership', () => {
  it('owner can read their document', async () => {
    const { data, error } = await owner.client.from('documents').select('id, title').eq('id', docId)
    expect(error).toBeNull()
    expect(data).toEqual([{ id: docId, title: 'Quarterly plan' }])
  })

  it('users cannot create documents owned by someone else', async () => {
    const { error } = await outsider.client.from('documents').insert({ owner_id: owner.id, title: 'Forged' })
    expect(error?.code).toBe('42501') // RLS violation
  })

  it('anonymous visitors cannot read anything', async () => {
    const anon = createClient(url, publishableKey, { auth: { persistSession: false } })
    const { data } = await anon.from('documents').select('id')
    expect(data ?? []).toEqual([])
  })
})

describe('documents: unrelated user is denied', () => {
  it('cannot select', async () => {
    const { data, error } = await outsider.client.from('documents').select('id').eq('id', docId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('cannot update content or title', async () => {
    const { data } = await outsider.client
      .from('documents')
      .update({ content: doc('hacked'), title: 'pwned' })
      .eq('id', docId)
      .select('id')
    expect(data ?? []).toEqual([])
    expect(await actual()).toMatchObject({ title: 'Quarterly plan', content: doc('secret plan') })
  })

  it('cannot delete', async () => {
    const { data } = await outsider.client.from('documents').delete().eq('id', docId).select('id')
    expect(data ?? []).toEqual([])
    expect(await actual()).toBeTruthy()
  })

  it('cannot share the document or read its shares', async () => {
    const { error } = await outsider.client.rpc('share_document', {
      p_document_id: docId,
      p_email: outsider.email,
      p_permission: 'editor',
    })
    expect(error?.code).toBe('42501')
    const { error: insertError } = await outsider.client
      .from('document_shares')
      .insert({ document_id: docId, shared_with_user_id: outsider.id, permission: 'editor' })
    expect(insertError?.code).toBe('42501')
  })

  it("cannot see the owner's profile", async () => {
    const { data } = await outsider.client.from('profiles').select('email').eq('id', owner.id)
    expect(data).toEqual([])
  })
})

describe('sharing: viewer', () => {
  it('collaborator has no access before sharing', async () => {
    const { data } = await collaborator.client.from('documents').select('id').eq('id', docId)
    expect(data).toEqual([])
  })

  it('rejects sharing with an unknown email and with yourself', async () => {
    const unknown = await owner.client.rpc('share_document', {
      p_document_id: docId,
      p_email: `nobody-${runId}@example.com`,
      p_permission: 'viewer',
    })
    expect(unknown.error?.code).toBe('P0002')
    expect(unknown.error?.message).toMatch(/No Ajaia Docs account/)

    const self = await owner.client.rpc('share_document', {
      p_document_id: docId,
      p_email: owner.email,
      p_permission: 'viewer',
    })
    expect(self.error?.code).toBe('22023')
  })

  it('owner shares by email (case-insensitive); viewer can read but not write', async () => {
    const { error } = await owner.client.rpc('share_document', {
      p_document_id: docId,
      p_email: collaborator.email.toUpperCase(),
      p_permission: 'viewer',
    })
    expect(error).toBeNull()

    const { data: read } = await collaborator.client.from('documents').select('title').eq('id', docId)
    expect(read).toEqual([{ title: 'Quarterly plan' }])

    const { data: written } = await collaborator.client
      .from('documents')
      .update({ content: doc('viewer edit') })
      .eq('id', docId)
      .select('id')
    expect(written ?? []).toEqual([])
    expect((await actual()).content).toEqual(doc('secret plan'))
  })

  it('recipient sees only their own share row and the owner email', async () => {
    const { data: shares } = await collaborator.client.from('document_shares').select('shared_with_user_id')
    expect(shares).toEqual([{ shared_with_user_id: collaborator.id }])
    const { data: profile } = await collaborator.client.from('profiles').select('email').eq('id', owner.id)
    expect(profile).toEqual([{ email: owner.email }])
  })

  it('a viewer cannot upgrade their own permission', async () => {
    const { data } = await collaborator.client
      .from('document_shares')
      .update({ permission: 'editor' })
      .eq('document_id', docId)
      .select('id')
    expect(data ?? []).toEqual([])
  })
})

describe('sharing: editor', () => {
  beforeAll(async () => {
    const { error } = await owner.client.rpc('share_document', {
      p_document_id: docId,
      p_email: collaborator.email,
      p_permission: 'editor',
    })
    if (error) throw error
  })

  it('editor can update content and the version increments', async () => {
    const before = await actual()
    const { data, error } = await collaborator.client
      .from('documents')
      .update({ content: doc('edited by collaborator') })
      .eq('id', docId)
      .eq('version', before.version)
      .select('version')
    expect(error).toBeNull()
    expect(data).toEqual([{ version: before.version + 1 }])
  })

  it('a save based on a stale version is rejected (no lost update)', async () => {
    const { version } = await actual()
    const { data } = await owner.client
      .from('documents')
      .update({ content: doc('stale write') })
      .eq('id', docId)
      .eq('version', version - 1)
      .select('id')
    expect(data).toEqual([])
    expect((await actual()).content).toEqual(doc('edited by collaborator'))
  })

  it('editor cannot rename, transfer ownership, delete, or re-share', async () => {
    const rename = await collaborator.client.from('documents').update({ title: 'Mine now' }).eq('id', docId)
    expect(rename.error?.code).toBe('42501')

    const transfer = await collaborator.client.from('documents').update({ owner_id: collaborator.id }).eq('id', docId)
    expect(transfer.error?.code).toBe('42501')

    const del = await collaborator.client.from('documents').delete().eq('id', docId).select('id')
    expect(del.data ?? []).toEqual([])

    const reshare = await collaborator.client.rpc('share_document', {
      p_document_id: docId,
      p_email: outsider.email,
      p_permission: 'viewer',
    })
    expect(reshare.error?.code).toBe('42501')

    expect(await actual()).toMatchObject({ title: 'Quarterly plan', owner_id: owner.id })
  })

  it('clients cannot tamper with the version counter', async () => {
    const { version } = await actual()
    await owner.client.from('documents').update({ version: 999 }).eq('id', docId)
    expect((await actual()).version).toBe(version)
  })
})

describe('revoking and deleting', () => {
  it('revoking a share removes access immediately', async () => {
    const { data, error } = await owner.client
      .from('document_shares')
      .delete()
      .eq('document_id', docId)
      .eq('shared_with_user_id', collaborator.id)
      .select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    const { data: read } = await collaborator.client.from('documents').select('id').eq('id', docId)
    expect(read).toEqual([])
  })

  it('owner can rename and delete', async () => {
    const rename = await owner.client.from('documents').update({ title: 'Renamed' }).eq('id', docId).select('title')
    expect(rename.data).toEqual([{ title: 'Renamed' }])
    const del = await owner.client.from('documents').delete().eq('id', docId).select('id')
    expect(del.data).toEqual([{ id: docId }])
  })
})
