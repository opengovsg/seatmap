-- OTP storage table
CREATE TABLE otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT DEFAULT 0,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Fast lookups for verification
CREATE INDEX idx_otp_email_code ON otp_codes(email, code) WHERE NOT verified;
CREATE INDEX idx_otp_expires ON otp_codes(expires_at);

-- Server-only access (service role bypasses RLS)
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

-- Cleanup function for expired codes
CREATE OR REPLACE FUNCTION delete_expired_otps()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM otp_codes WHERE expires_at < now();
END;
$$;
