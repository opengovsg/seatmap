import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function isAllowedEmail(email: string) {
  return /^[^@]+@([a-z0-9-]+\.)*open\.gov\.sg$/i.test(email)
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (tokenHash && type) {
    const supabase = await createClient()

    // Verify the token hash and create session
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as any,
    })

    if (error) {
      console.error('Failed to verify token:', error)
      return NextResponse.redirect(`${origin}/login?error=auth`)
    }

    // Hard-enforce email domain — sign out and reject if not allowed
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email || !isAllowedEmail(user.email)) {
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/login?error=domain`)
    }

    return NextResponse.redirect(`${origin}/map`)
  }

  // Fallback for invalid requests
  return NextResponse.redirect(`${origin}/login`)
}
