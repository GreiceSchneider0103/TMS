import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const apiKey = String(body?.apiKey || '').trim();
  const email = String(body?.email || '').trim();
  const password = String(body?.password || '').trim();

  if (!email || !password || !apiKey) {
    return NextResponse.json({ error: 'email, password and apiKey are required' }, { status: 400 });
  }

  const upstream = await fetch(`${API_BASE}/auth/session`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-idempotency-key': `login-${email}`
    },
    body: JSON.stringify({ apiKey })
  });

  const data = await upstream.json();
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });

  const res = NextResponse.json({ ok: true });
  const maxAge = Number(process.env.SESSION_MAX_AGE_SECONDS || 28_800);
  const cookieName = process.env.SESSION_COOKIE_NAME || 'tms_api_session';
  const cookieDomain = process.env.SESSION_COOKIE_DOMAIN || undefined;

  const forceSecure = String(process.env.SESSION_COOKIE_SECURE || '').toLowerCase();
  const secure = forceSecure ? forceSecure === 'true' : process.env.NODE_ENV === 'production';

  res.cookies.set(cookieName, apiKey, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    maxAge,
    path: '/',
    ...(cookieDomain ? { domain: cookieDomain } : {})
  });
  res.cookies.set('tms_session', '1', {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    maxAge,
    path: '/',
    ...(cookieDomain ? { domain: cookieDomain } : {})
  });

  return res;
}
