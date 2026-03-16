import { NextResponse } from 'next/server';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const cookieName = process.env.SESSION_COOKIE_NAME || 'tms_api_session';
  const cookieDomain = process.env.SESSION_COOKIE_DOMAIN || undefined;
  const forceSecure = String(process.env.SESSION_COOKIE_SECURE || '').toLowerCase();
  const secure = forceSecure ? forceSecure === 'true' : process.env.NODE_ENV === 'production';
  res.cookies.set(cookieName, '', { httpOnly: true, secure, sameSite: 'strict', maxAge: 0, path: '/', ...(cookieDomain ? { domain: cookieDomain } : {}) });
  res.cookies.set('tms_session', '', { httpOnly: true, secure, sameSite: 'strict', maxAge: 0, path: '/', ...(cookieDomain ? { domain: cookieDomain } : {}) });
  return res;
}
