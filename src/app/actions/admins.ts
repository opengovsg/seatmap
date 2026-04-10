'use server'

import { createClient } from '@/lib/supabase/server'
import {
  addAdmin,
  removeAdmin,
  transferOwnership,
  listAdmins,
  isOwner,
  isAdmin,
  addEditor,
  getAdminRecord,
  type AdminRecord,
} from '@/lib/admins'

async function requireOwner(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('Not authenticated.')
  const owner = await isOwner(user.email)
  if (!owner) throw new Error('Only the owner can perform this action.')
  return user.email
}

async function requireAdmin(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('Not authenticated.')
  if (!(await isAdmin(user.email))) {
    throw new Error('Admin access required.')
  }
  return user.email
}

export async function addAdminAction(email: string): Promise<void> {
  await requireOwner()
  await addAdmin(email)
}

export async function removeAdminAction(email: string): Promise<void> {
  await requireOwner()
  await removeAdmin(email)
}

export async function transferOwnershipAction(newOwnerEmail: string): Promise<void> {
  const currentOwnerEmail = await requireOwner()
  await transferOwnership(newOwnerEmail, currentOwnerEmail)
}

export async function listAdminsAction(): Promise<AdminRecord[]> {
  return listAdmins()
}

export async function addEditorAction(email: string): Promise<void> {
  await requireAdmin() // Only admins can add editors
  await addEditor(email)
}

export async function removeEditorAction(email: string): Promise<void> {
  await requireAdmin()
  const record = await getAdminRecord(email)
  if (record?.role !== 'editor') {
    throw new Error('Can only remove editors with this action.')
  }
  await removeAdmin(email)
}

export async function listEditorsAction(): Promise<AdminRecord[]> {
  await requireAdmin()
  const all = await listAdmins()
  return all.filter(a => a.role === 'editor')
}
