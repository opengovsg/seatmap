# OTP Authentication Implementation Summary

## What Was Implemented

Successfully replaced Supabase magic link authentication with Postman OTP (One-Time Password) authentication.

### Files Created

1. **`supabase/add-otp-codes.sql`** - Database schema for OTP storage
2. **`src/lib/postman.ts`** - Email service utility (Postman API integration)
3. **`src/app/api/auth/request-otp/route.ts`** - API endpoint to request OTP
4. **`src/app/api/auth/verify-otp/route.ts`** - API endpoint to verify OTP
5. **`src/lib/supabase/admin.ts`** - Already existed (no changes needed)

### Files Modified

1. **`src/app/login/page.tsx`** - Complete rewrite of login UI
   - Added OTP input card with 6-digit numeric input
   - Added resend functionality with 60-second countdown
   - Auto-submit when 6 digits entered
   - Removed Supabase client dependency

2. **`README.md`** - Updated documentation
   - Changed authentication description to OTP
   - Added Postman environment variables
   - Added step 11 for database setup

3. **`src/app/auth/callback/route.ts`** - Renamed to `callback-legacy-backup.ts`
   - Preserved as backup for potential rollback
   - Added explanatory comment header

## Required Setup Steps

### 1. Environment Variables

Add to your `.env.local` file:

```bash
POSTMAN_API_KEY=your-postman-api-key
POSTMAN_FROM_EMAIL=seatmap@open.gov.sg  # Optional, defaults to this
```

### 2. Database Migration

Run this SQL file in the Supabase SQL editor:

```
supabase/add-otp-codes.sql
```

This creates:
- `otp_codes` table for storing verification codes
- Indexes for fast lookups
- Row Level Security (RLS) enabled
- Cleanup function for expired codes

### 3. Test the Implementation

#### Manual Testing Checklist

**Happy Path:**
- [ ] Navigate to `/login`
- [ ] Enter valid `@open.gov.sg` email
- [ ] Click "Send login code"
- [ ] Check email inbox for 6-digit code
- [ ] Enter code in the OTP input field
- [ ] Verify redirect to `/map`
- [ ] Check session persists on refresh

**Error Scenarios:**
- [ ] Invalid email domain → Error before API call
- [ ] Wrong OTP code → "Invalid verification code"
- [ ] Request OTP twice within 60s → Rate limit error
- [ ] Try resending code → Countdown timer works
- [ ] Enter 5 wrong codes → Track attempt count

**UI/UX:**
- [ ] Numeric keyboard appears on mobile
- [ ] OTP input accepts only numbers
- [ ] Auto-submits when 6 digits entered
- [ ] Resend button countdown updates every second
- [ ] Loading states show correctly

## Key Features

### Security Features

1. **Rate Limiting**: 60-second cooldown between OTP requests per email
2. **Expiration**: OTP codes expire after 15 minutes
3. **Attempt Limiting**: Maximum 5 failed verification attempts
4. **Domain Validation**: Only `@open.gov.sg` emails allowed
5. **Single-Use Codes**: OTPs marked as verified after use
6. **Rollback on Failure**: Database record deleted if email fails to send

### User Experience

1. **Auto-Submit**: Automatically verifies when 6 digits entered
2. **Resend with Countdown**: Clear feedback on when users can resend
3. **Numeric Input**: Mobile-optimized keyboard for code entry
4. **Large, Centered Text**: Easy-to-read OTP input field
5. **Clear Error Messages**: Helpful feedback for all error states

## Architecture

### Authentication Flow

```
1. User enters email on login page
   ↓
2. POST /api/auth/request-otp
   - Validates email domain
   - Checks rate limit
   - Generates 6-digit code
   - Stores in database
   - Sends via Postman API
   ↓
3. User receives email with code
   ↓
4. User enters code in UI
   ↓
5. POST /api/auth/verify-otp (auto-triggered at 6 digits)
   - Validates code exists and not expired
   - Checks attempt count
   - Marks code as verified
   - Creates Supabase user session
   - Sets authentication cookies
   ↓
6. User redirected to /map
```

### Database Schema

```sql
otp_codes:
- id (UUID, primary key)
- email (TEXT)
- code (TEXT, 6 digits)
- expires_at (TIMESTAMPTZ)
- attempts (INT, default 0)
- verified (BOOLEAN, default false)
- created_at (TIMESTAMPTZ)

Indexes:
- idx_otp_email_code ON (email, code) WHERE NOT verified
- idx_otp_expires ON (expires_at)
```

## Rollback Plan

If issues occur:

1. **Restore old callback route:**
   ```bash
   mv src/app/auth/callback-legacy-backup.ts src/app/auth/callback/route.ts
   ```

2. **Revert login page:**
   ```bash
   git checkout main src/app/login/page.tsx
   ```

3. **Database is non-destructive:**
   - New `otp_codes` table doesn't affect existing auth
   - No changes to `auth.users` table
   - Old Supabase auth still works

## Testing the Postman API Directly

To verify Postman integration works:

```bash
curl -X POST https://api.postman.gov.sg/v1/transactional/email/send \
  -H "Authorization: Bearer $POSTMAN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Test Email",
    "body": "<p>Testing Postman API integration</p>",
    "recipient": "you@open.gov.sg"
  }'
```

Expected: `201 Created` response with message ID.

## Known Limitations

1. **Email delivery time**: Depends on Postman API and email servers (typically < 30 seconds)
2. **No cleanup scheduled task**: Expired OTP codes accumulate (manual cleanup needed)
3. **Single device limitation**: OTP is email-based, not device-specific
4. **No backup auth method**: If Postman API is down, users cannot log in

## Future Improvements

Consider adding:
- Scheduled cleanup job for expired OTPs (e.g., daily cron)
- IP-based rate limiting (in addition to email-based)
- Monitoring/alerting for failed email sends
- CAPTCHA after multiple failed login attempts
- Support for email code expiry countdown in UI
- Retry logic for transient Postman API errors

## Support

For issues:
- Check browser console for errors
- Check server logs for API errors
- Verify Postman API key is valid
- Check Supabase service role key has correct permissions
- Ensure database migration was run successfully
