'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSubmitted(true)
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        {submitted ? (
          <CheckEmailCard email={email} />
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
    <div className={cn('flex flex-col gap-6', className)}>
      <Card>
        <CardHeader>
          <CardTitle>Sign in to SeatMap</CardTitle>
          <CardDescription>
            Enter your work email and we&apos;ll send you a login link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@open.gov.sg"
                  value={email}
                  onChange={(e) => onEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending…' : 'Send login link'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function CheckEmailCard({ email, className }: { email: string; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a login link to <strong>{email}</strong>. Click it to sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Didn&apos;t get it? Check your spam folder, or go back and try again.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
