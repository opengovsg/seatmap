import { randomBytes } from 'crypto'

const POSTMAN_API_URL = 'https://api.postman.gov.sg/v1/transactional/email/send'
const POSTMAN_API_KEY = process.env.POSTMAN_API_KEY
const FROM_EMAIL = process.env.POSTMAN_FROM_EMAIL || 'seatmap@open.gov.sg'

/**
 * Generate a cryptographically secure 6-digit OTP code
 */
export function generateOtpCode(): string {
  // Generate 3 random bytes, convert to number, take modulo 1000000 to get 6 digits
  const buffer = randomBytes(3)
  const num = buffer.readUIntBE(0, 3)
  const code = (num % 1000000).toString().padStart(6, '0')
  return code
}

/**
 * Get plain text email template for OTP code
 */
export function getOtpEmailHtml(code: string, expiryMinutes: number = 15): string {
  return `Hi there,<br><br>You requested to sign in to SeatMap.<br><br>Use the code below to complete your login:<br><br>${code}<br><br>This code expires in ${expiryMinutes} minutes.<br><br>If you didn't request this code, you can safely ignore this email.<br><br>---<br><br>This is an automated message from seatmap. Please do not reply to this email.`
}

/**
 * Send email via Postman API
 */
export async function sendEmail(
  recipient: string,
  subject: string,
  body: string
): Promise<void> {
  if (!POSTMAN_API_KEY) {
    throw new Error('POSTMAN_API_KEY is not configured')
  }

  const response = await fetch(POSTMAN_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${POSTMAN_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject,
      body,
      recipient,
      from: FROM_EMAIL,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Postman API error: ${response.status} ${errorText}`)
  }
}
