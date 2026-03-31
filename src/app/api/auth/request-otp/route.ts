import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateOtpCode, getOtpEmailHtml, sendEmail } from '@/lib/postman'

const OTP_EXPIRY_MINUTES = 15
const RATE_LIMIT_SECONDS = 60

function isAllowedEmail(email: string) {
  return /^[^@]+@([a-z0-9-]+\.)*open\.gov\.sg$/i.test(email)
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    // Validate email format
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
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

    // Check rate limit: no new OTP within last 60 seconds
    const rateLimitTime = new Date(Date.now() - RATE_LIMIT_SECONDS * 1000)
    const { data: recentOtps } = await db
      .from('otp_codes')
      .select('created_at')
      .eq('email', email)
      .gte('created_at', rateLimitTime.toISOString())
      .limit(1)

    if (recentOtps && recentOtps.length > 0) {
      return NextResponse.json(
        { error: 'Please wait before requesting another code' },
        { status: 429 }
      )
    }

    // Generate OTP code
    const code = generateOtpCode()
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

    // Store OTP in database
    const { data: otpRecord, error: insertError } = await db
      .from('otp_codes')
      .insert({
        email,
        code,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('Failed to store OTP:', insertError)
      return NextResponse.json(
        { error: 'Failed to generate verification code' },
        { status: 500 }
      )
    }

    // Send email via Postman
    try {
      const emailHtml = getOtpEmailHtml(code, OTP_EXPIRY_MINUTES)
      await sendEmail(
        email,
        'Your seatmap verification code',
        emailHtml
      )
    } catch (emailError) {
      console.error('Failed to send email:', emailError)

      // Rollback: delete the OTP record since email failed
      await db.from('otp_codes').delete().eq('id', otpRecord.id)

      return NextResponse.json(
        { error: 'Failed to send verification email' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Request OTP error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
