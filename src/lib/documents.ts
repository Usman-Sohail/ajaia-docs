import type { JSONContent } from '@tiptap/react'
import { supabase } from './supabase'

export type SharePermission = 'viewer' | 'editor'
export type AccessRole = 'owner' | SharePermission

export interface DocumentSummary {
  id: string
  title: string
  updatedAt: string
  ownerEmail: string | null
  role: AccessRole
}

export interface DocumentRecord extends DocumentSummary {
  content: JSONContent
  version: number
}

export interface DocumentShare {
  id: string
  permission: SharePermission
  email: string | null
  createdAt: string
}

export const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }
export const MAX_TITLE_LENGTH = 200

/** Raised when a save is rejected because someone else saved a newer version first. */
export class SaveConflictError extends Error {
  constructor() {
    super('This document was changed in another session. Reload to get the latest version.')
    this.name = 'SaveConflictError'
  }
}

interface DocumentRow {
  id: string
  title: string
  owner_id: string
  updated_at: string
  owner: { email: string | null } | null
  // RLS returns every share to the owner, and only their own share to a recipient.
  document_shares: { permission: SharePermission; shared_with_user_id: string }[]
}

// Without generated DB types, postgrest-js types embedded many-to-one relations (owner,
// recipient) as arrays; at runtime they are single objects, so rows are cast via `unknown`.
const SUMMARY_COLUMNS =
  'id, title, owner_id, updated_at, owner:profiles!owner_id(email), document_shares(permission, shared_with_user_id)'

function roleFor(row: DocumentRow, userId: string): AccessRole {
  if (row.owner_id === userId) return 'owner'
  return row.document_shares.find((s) => s.shared_with_user_id === userId)?.permission ?? 'viewer'
}

function toSummary(row: DocumentRow, userId: string): DocumentSummary {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
    ownerEmail: row.owner?.email ?? null,
    role: roleFor(row, userId),
  }
}

export function normalizeTitle(title: string): string {
  return title.trim().slice(0, MAX_TITLE_LENGTH)
}

/** Every document the user can read (owned + shared), most recently updated first. */
export async function listDocuments(userId: string): Promise<DocumentSummary[]> {
  const { data, error } = await supabase
    .from('documents')
    .select(SUMMARY_COLUMNS)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data as unknown as DocumentRow[]).map((row) => toSummary(row, userId))
}

/** Returns null when the document doesn't exist or the user has no access (RLS hides it). */
export async function getDocument(id: string, userId: string): Promise<DocumentRecord | null> {
  const { data, error } = await supabase
    .from('documents')
    .select(`${SUMMARY_COLUMNS}, content, version`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as unknown as DocumentRow & { content: JSONContent; version: number }
  return { ...toSummary(row, userId), content: row.content, version: row.version }
}

export async function createDocument(
  userId: string,
  input: { title?: string; content?: JSONContent } = {},
): Promise<DocumentSummary> {
  const { data, error } = await supabase
    .from('documents')
    .insert({
      owner_id: userId,
      title: normalizeTitle(input.title ?? '') || 'Untitled document',
      content: input.content ?? EMPTY_DOC,
    })
    .select(SUMMARY_COLUMNS)
    .single()
  if (error) throw error
  return toSummary(data as unknown as DocumentRow, userId)
}

export async function renameDocument(id: string, title: string): Promise<{ title: string; updatedAt: string }> {
  const clean = normalizeTitle(title)
  if (!clean) throw new Error('Title cannot be empty')
  const { data, error } = await supabase
    .from('documents')
    .update({ title: clean })
    .eq('id', id)
    .select('title, updated_at')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('You no longer have permission to rename this document')
  return { title: data.title, updatedAt: data.updated_at }
}

/**
 * Saves content only if the server still has `expectedVersion` (optimistic concurrency),
 * so a stale tab or collaborator can never silently overwrite newer content.
 */
export async function saveDocumentContent(
  id: string,
  content: JSONContent,
  expectedVersion: number,
): Promise<{ version: number; updatedAt: string }> {
  const { data, error } = await supabase
    .from('documents')
    .update({ content })
    .eq('id', id)
    .eq('version', expectedVersion)
    .select('version, updated_at')
    .maybeSingle()
  if (error) throw error
  if (data) return { version: data.version, updatedAt: data.updated_at }

  // No row updated: distinguish a version conflict from lost access.
  const { data: current, error: readError } = await supabase
    .from('documents')
    .select('version')
    .eq('id', id)
    .maybeSingle()
  if (readError) throw readError
  if (current) throw new SaveConflictError()
  throw new Error('You no longer have access to this document')
}

/** Current server version, used when the user chooses to overwrite after a conflict. */
export async function getDocumentVersion(id: string): Promise<number> {
  const { data, error } = await supabase.from('documents').select('version').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('You no longer have access to this document')
  return data.version as number
}

export async function deleteDocument(id: string): Promise<void> {
  const { data, error } = await supabase.from('documents').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data.length) throw new Error('Only the owner can delete this document')
}

export async function listShares(documentId: string): Promise<DocumentShare[]> {
  const { data, error } = await supabase
    .from('document_shares')
    .select('id, permission, created_at, recipient:profiles!shared_with_user_id(email)')
    .eq('document_id', documentId)
    .order('created_at')
  if (error) throw error
  const rows = data as unknown as {
    id: string
    permission: SharePermission
    created_at: string
    recipient: { email: string | null } | null
  }[]
  return rows.map((s) => ({ id: s.id, permission: s.permission, email: s.recipient?.email ?? null, createdAt: s.created_at }))
}

export async function shareDocument(documentId: string, email: string, permission: SharePermission): Promise<void> {
  const { error } = await supabase.rpc('share_document', {
    p_document_id: documentId,
    p_email: email.trim(),
    p_permission: permission,
  })
  if (error) throw error
}

export async function updateSharePermission(shareId: string, permission: SharePermission): Promise<void> {
  const { data, error } = await supabase.from('document_shares').update({ permission }).eq('id', shareId).select('id')
  if (error) throw error
  if (!data.length) throw new Error('Only the owner can change sharing')
}

export async function removeShare(shareId: string): Promise<void> {
  const { data, error } = await supabase.from('document_shares').delete().eq('id', shareId).select('id')
  if (error) throw error
  if (!data.length) throw new Error('Only the owner can change sharing')
}
