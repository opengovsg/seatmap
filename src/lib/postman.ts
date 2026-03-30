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
 * Get HTML email template for OTP code
 */
export function getOtpEmailHtml(code: string, expiryMinutes: number = 15): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f4f4f4;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      background: #1a1a1a;
      color: white;
      padding: 30px 40px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
    }
    .content {
      padding: 40px;
    }
    .otp-code {
      background: #f8f8f8;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 30px 0;
    }
    .otp-code .label {
      font-size: 14px;
      color: #666;
      margin-bottom: 10px;
    }
    .otp-code .code {
      font-size: 36px;
      font-weight: 700;
      letter-spacing: 8px;
      color: #1a1a1a;
      font-family: 'Courier New', monospace;
    }
    .expiry {
      text-align: center;
      color: #666;
      font-size: 14px;
      margin-top: 10px;
    }
    .footer {
      padding: 20px 40px;
      background: #f8f8f8;
      color: #666;
      font-size: 13px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🪑 seatmap</h1>
    </div>
    <div class="content">
      <p>Hi there,</p>
      <p>You requested to sign in to SeatMap. Use the code below to complete your login:</p>

      <div class="otp-code">
        <div class="label">Your verification code</div>
        <div class="code">${code}</div>
      </div>

      <p class="expiry">This code expires in ${expiryMinutes} minutes.</p>

      <p>If you didn't request this code, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      <p>This is an automated message from SeatMap. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
  `.trim()
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
