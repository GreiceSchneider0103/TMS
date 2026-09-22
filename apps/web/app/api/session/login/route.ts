import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const apiKey = String(body?.apiKey || '').trim();

  if (!apiKey) {
    return NextResponse.json({ error: 'apiKey is required' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE}/auth/session`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-idempotency-key': `login-${crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16)}`
      },
      body: JSON.stringify({ apiKey })
    });
  } catch (err: any) {
    console.error('[login] fetch to upstream failed:', API_BASE, err?.message || err);
    return NextResponse.json(
      { error: `Falha ao conectar na API (${API_BASE}): ${err?.message || 'erro desconhecido'}` },
      { status: 502 }
    );
  }

  const contentType = upstream.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await upstream.text();
    console.error(
      '[login] upstream returned non-JSON response. status=',
      upstream.status,
      'content-type=',
      contentType,
      'body(first 300 chars)=',
      text.slice(0, 300)
    );
    return NextResponse.json(
      {
        error: `API respondeu algo que não é JSON (status ${upstream.status}). Verifique NEXT_PUBLIC_API_BASE_URL.`
      },
      { status: 502 }
    );
  }

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
