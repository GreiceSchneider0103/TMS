# Credential Rotation Required (Phase 2)

The following credentials were previously exposed in tracked `.env` files and **must be rotated immediately**:

1. `DATABASE_URL`
2. `TINY_API_TOKEN`
3. `INTERNAL_CONTEXT_TOKEN`

## Rotation Checklist

- Regenerate database password / connection string in Supabase.
- Generate a new Tiny API token and revoke the old one.
- Generate a new long random internal context token.
- Update values only in your secret manager / deployment environment variables.
- Do **not** commit `.env` files.

## Repository protections applied

- Added `.env` ignore rules to `.gitignore`.
- Removed tracked `.env` and `apps/api/.env` from git index.
- Kept only `.env.example` with placeholders.
