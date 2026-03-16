import { NextResponse } from 'next/server';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const cookieName = process.env.SESSION_COOKIE_NAME || 'tms_api_session';
  res.cookies.set(cookieName, '', { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 0, path: '/' });
  res.cookies.set('tms_session', '', { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 0, path: '/' });
  return res;
}
