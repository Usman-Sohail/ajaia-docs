// Creates (or resets) three confirmed reviewer accounts and a sample document shared with reviewer 2.
// Usage: npm run seed:reviewers   (requires SUPABASE_SECRET_KEY + REVIEWER_PASSWORD in .env.local)
import { createClient } from '@supabase/supabase-js'
import { loadLocalEnv, requireEnv } from './env'

loadLocalEnv()
const url = requireEnv('VITE_SUPABASE_URL')
const secretKey = requireEnv('SUPABASE_SECRET_KEY')
const publishableKey = requireEnv('VITE_SUPABASE_PUBLISHABLE_KEY')
const password = requireEnv('REVIEWER_PASSWORD')
if (password.length < 8) throw new Error('REVIEWER_PASSWORD must be at least 8 characters')

const REVIEWERS = [
  process.env.REVIEWER_1_EMAIL ?? 'reviewer1@example.com',
  process.env.REVIEWER_2_EMAIL ?? 'reviewer2@example.com',
  // Nothing is shared with reviewer 3: use it to confirm an unrelated user is denied access.
  process.env.REVIEWER_3_EMAIL ?? 'reviewer3@example.com',
]

const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

async function findUserId(email: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const match = data.users.find((u) => u.email?.toLowerCase() === email)
    if (match) return match.id
    if (data.users.length < 200) return null
  }
}

async function ensureUser(email: string): Promise<string> {
  const existing = await findUserId(email)
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing, { password, email_confirm: true })
    if (error) throw error
    console.log(`✓ Reset password for ${email}`)
    return existing
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  console.log(`✓ Created ${email}`)
  return data.user.id
}

const SAMPLE_CONTENT = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Welcome to Ajaia Docs' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'This document is owned by reviewer 1 and shared with reviewer 2 as an ' },
        { type: 'text', text: 'editor', marks: [{ type: 'bold' }] },
        { type: 'text', text: '. Try formatting, refreshing, and sharing.' },
      ],
    },
    {
      type: 'bulletList',
      content: ['Bold, italic, underline', 'Headings and lists', 'Autosave with conflict detection'].map((text) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      })),
    },
  ],
}

async function main() {
  const [ownerId] = await Promise.all(REVIEWERS.map(ensureUser))

  // Create the sample doc as reviewer 1 through the public API, so RLS applies as in the app.
  const owner = createClient(url, publishableKey, { auth: { persistSession: false } })
  const { error: signInError } = await owner.auth.signInWithPassword({ email: REVIEWERS[0], password })
  if (signInError) throw signInError

  const { data: existing, error: listError } = await owner
    .from('documents')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('title', 'Welcome to Ajaia Docs')
  if (listError) throw listError

  let docId = existing[0]?.id as string | undefined
  if (!docId) {
    const { data, error } = await owner
      .from('documents')
      .insert({ owner_id: ownerId, title: 'Welcome to Ajaia Docs', content: SAMPLE_CONTENT })
      .select('id')
      .single()
    if (error) throw error
    docId = data.id as string
    console.log('✓ Created sample document')
  }

  const { error: shareError } = await owner.rpc('share_document', {
    p_document_id: docId,
    p_email: REVIEWERS[1],
    p_permission: 'editor',
  })
  if (shareError) throw shareError
  console.log(`✓ Shared sample document with ${REVIEWERS[1]} (editor)`)
  console.log(`\nReviewer accounts: ${REVIEWERS.join(', ')} (password: value of REVIEWER_PASSWORD)`)
}

main().catch((error: unknown) => {
  console.error('Seeding failed:', error)
  process.exit(1)
})
