import { createAdminClient } from '@/lib/supabase/admin'

export type AdminRole = 'owner' | 'admin' | 'editor'
export type UserRole = 'owner' | 'admin' | 'editor' | 'user'

export interface AdminRecord {
  email: string
  role: AdminRole
  added_at: string
}

function db() {
  return createAdminClient()
}

export async function getAdminRecord(email: string): Promise<AdminRecord | null> {
  const { data } = await db().from('admins').select('*').eq('email', email).single()
  return data ?? null
}

export async function isAdmin(email: string): Promise<boolean> {
  const record = await getAdminRecord(email)
  return record !== null
}

export async function isOwner(email: string): Promise<boolean> {
  const record = await getAdminRecord(email)
  return record?.role === 'owner'
}

export async function getUserRole(email: string): Promise<UserRole> {
  const record = await getAdminRecord(email)
  if (!record) return 'user'
  return record.role
}

// Role hierarchy: owner > admin > editor > user
const ROLE_HIERARCHY = { owner: 3, admin: 2, editor: 1, user: 0 }

export async function isEditor(email: string): Promise<boolean> {
  const role = await getUserRole(email)
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.editor
}

export async function addEditor(email: string): Promise<void> {
  const { error } = await db().from('admins').insert({ email, role: 'editor' })
  if (error) throw new Error(error.message)
}

export async function listAdmins(): Promise<AdminRecord[]> {
  const { data } = await db()
    .from('admins')
    .select('*')
    .order('role', { ascending: true }) // 'admin' before 'owner' alphabetically — we'll sort in UI
    .order('email', { ascending: true })
  return (data ?? []) as AdminRecord[]
}

export async function addAdmin(email: string): Promise<void> {
  const { error } = await db().from('admins').insert({ email, role: 'admin' })
  if (error) throw new Error(error.message)
}

export async function removeAdmin(email: string): Promise<void> {
  const record = await getAdminRecord(email)
  if (record?.role === 'owner') throw new Error('Cannot remove the owner.')
  const { error } = await db().from('admins').delete().eq('email', email)
  if (error) throw new Error(error.message)
}

export async function transferOwnership(
  newOwnerEmail: string,
  currentOwnerEmail: string,
): Promise<void> {
  const newOwner = await getAdminRecord(newOwnerEmail)
  if (!newOwner) throw new Error('That person is not an admin yet. Add them as an admin first.')

  const client = db()

  const { error: e1 } = await client
    .from('admins')
    .update({ role: 'owner' })
    .eq('email', newOwnerEmail)
  if (e1) throw new Error(e1.message)

  const { error: e2 } = await client
    .from('admins')
    .update({ role: 'admin' })
    .eq('email', currentOwnerEmail)
  if (e2) throw new Error(e2.message)
}
