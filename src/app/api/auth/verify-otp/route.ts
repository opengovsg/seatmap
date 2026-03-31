import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'

const MAX_ATTEMPTS = 5

function isAllowedEmail(email: string) {
  return /^[^@]+@([a-z0-9-]+\.)*open\.gov\.sg$/i.test(email)
}

export async function POST(request: Request) {
  try {
    const { email, code } = await request.json()

    // Validate input
    if (!email || typeof email !== 'string' || !code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Email and code are required' },
        { status: 400 }
      )
    }

    // Validate email domain
    if (!isAllowedEmail(email)) {
      return NextResponse.json(
        { error: 'Only open.gov.sg email addresses are allowed' },
        { status: 400 }
      )
    }

    const db = createAdminClient()

    // Find matching OTP record
    const { data: otpRecords } = await db
      .from('otp_codes')
      .select('*')
      .eq('email', email)
      .eq('verified', false)
      .order('created_at', { ascending: false })
      .limit(1)

    const otpRecord = otpRecords?.[0]

    // Check if OTP exists
    if (!otpRecord) {
      return NextResponse.json(
        { error: 'Invalid or expired verification code' },
        { status: 400 }
      )
    }

    // Check if expired
    if (new Date(otpRecord.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Verification code has expired' },
        { status: 400 }
      )
    }

    // Check if max attempts exceeded
    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Please request a new code.' },
        { status: 400 }
      )
    }

    // Verify code matches
    if (otpRecord.code !== code) {
      // Increment attempts on wrong code
      await db
        .from('otp_codes')
        .update({ attempts: otpRecord.attempts + 1 })
        .eq('id', otpRecord.id)

      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 400 }
      )
    }

    // Mark OTP as verified to prevent reuse
    await db
      .from('otp_codes')
      .update({ verified: true })
      .eq('id', otpRecord.id)

    // Get existing user or create new one
    let userId: string

    // Try to get existing user first
    const { data: existingUsers } = await db.auth.admin.listUsers()
    const existingUser = existingUsers?.users.find(u => u.email === email)

    if (existingUser) {
      userId = existingUser.id
    } else {
      // Create new user if doesn't exist
      const { data: userData, error: userError } = await db.auth.admin.createUser({
        email,
        email_confirm: true,
      })

      if (userError) {
        console.error('Failed to create user:', userError)
        return NextResponse.json(
          { error: 'Failed to create session' },
          { status: 500 }
        )
      }

      userId = userData.user.id
    }

    // Generate a session link (like magic link does)
    const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('Failed to generate session:', linkError)
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      )
    }

    // Return the hashed token - client will use it to exchange for session
    return NextResponse.json({
      success: true,
      token: linkData.properties.hashed_token,
    })
  } catch (error) {
    console.error('Verify OTP error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
