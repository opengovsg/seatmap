'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from '@/components/ui/field'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  )
}

function LoginPageInner() {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendCountdown, setResendCountdown] = useState(0)
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('error') === 'domain') {
      setError('Only open.gov.sg email addresses are allowed.')
    }
  }, [searchParams])

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCountdown])

  function isAllowedEmail(email: string) {
    return /^[^@]+@([a-z0-9-]+\.)*open\.gov\.sg$/i.test(email)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!isAllowedEmail(email)) {
      setError('Only open.gov.sg email addresses are allowed.')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to send verification code')
        setLoading(false)
        return
      }

      setOtpSent(true)
      setResendCountdown(60)
      setLoading(false)
    } catch (err) {
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e?: React.FormEvent) {
    if (e) e.preventDefault()

    if (otp.length !== 6) return

    setVerifying(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Invalid verification code')
        setVerifying(false)
        return
      }

      // Success - redirect to map
      window.location.href = '/map'
    } catch (err) {
      setError('An unexpected error occurred')
      setVerifying(false)
    }
  }

  async function handleResendOtp() {
    if (resendCountdown > 0) return

    setOtp('')
    setError(null)
    setLoading(true)

    try {
      const response = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to send verification code')
      } else {
        setResendCountdown(60)
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm">
        {otpSent ? (
          <EnterOtpCard
            email={email}
            otp={otp}
            onOtp={setOtp}
            onVerify={handleVerifyOtp}
            onResend={handleResendOtp}
            verifying={verifying}
            resendCountdown={resendCountdown}
            error={error}
          />
        ) : (
          <LoginCard
            email={email}
            onEmail={setEmail}
            onSubmit={handleSubmit}
            loading={loading}
            error={error}
          />
        )}
      </div>
    </div>
  )
}

function LoginCard({
  email,
  onEmail,
  onSubmit,
  loading,
  error,
  className,
}: {
  email: string
  onEmail: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  loading: boolean
  error: string | null
  className?: string
}) {
  return (
    <Card className={cn('p-0', className)}>
      <CardContent className="p-6 md:p-8">
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <div className="flex flex-col items-center gap-1 text-center mb-2">
              <span className="text-4xl mb-1">🪑</span>
              <span className="font-bold text-3xl tracking-tight">seatmap</span>
            </div>
            <Field>
              <p className="text-muted-foreground text-sm mb-1">
                Enter your work email and we&apos;ll send you a verification code.
              </p>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="you@open.gov.sg"
                value={email}
                onChange={(e) => onEmail(e.target.value)}
                required
                autoFocus
              />
              {error && <FieldError>{error}</FieldError>}
            </Field>
            <Field>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending…' : 'Send login code'}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function EnterOtpCard({
  email,
  otp,
  onOtp,
  onVerify,
  onResend,
  verifying,
  resendCountdown,
  error,
  className,
}: {
  email: string
  otp: string
  onOtp: (v: string) => void
  onVerify: (e?: React.FormEvent) => void
  onResend: () => void
  verifying: boolean
  resendCountdown: number
  error: string | null
  className?: string
}) {
  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (otp.length === 6 && !verifying) {
      onVerify()
    }
  }, [otp, verifying, onVerify])

  return (
    <Card className={cn('p-0', className)}>
      <CardContent className="p-6 md:p-8">
        <form onSubmit={onVerify}>
          <FieldGroup>
            <div className="flex flex-col items-center gap-1 text-center mb-2">
              <span className="text-4xl mb-1">🪑</span>
              <span className="font-bold text-3xl tracking-tight">seatmap</span>
            </div>
            <Field>
              <p className="text-muted-foreground text-sm mb-1">
                We sent a 6-digit code to <strong>{email}</strong>
              </p>
              <FieldLabel htmlFor="otp">Verification Code</FieldLabel>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="000000"
                value={otp}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6)
                  onOtp(value)
                }}
                maxLength={6}
                required
                autoFocus
                autoComplete="one-time-code"
                className="text-center text-2xl tracking-widest font-mono"
              />
              {error && <FieldError>{error}</FieldError>}
            </Field>
            <Field>
              <Button type="submit" className="w-full" disabled={verifying || otp.length !== 6}>
                {verifying ? 'Verifying…' : 'Verify Code'}
              </Button>
            </Field>
            <div className="text-center">
              <button
                type="button"
                onClick={onResend}
                disabled={resendCountdown > 0}
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resendCountdown > 0
                  ? `Resend code in ${resendCountdown}s`
                  : 'Resend code'}
              </button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
