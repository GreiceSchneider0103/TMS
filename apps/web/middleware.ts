import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const hasSession = req.cookies.get('tms_session')?.value === '1';
  const isLogin = req.nextUrl.pathname.startsWith('/login');

  if (!hasSession && !isLogin) return NextResponse.redirect(new URL('/login', req.url));
  if (hasSession && isLogin) return NextResponse.redirect(new URL('/dashboard', req.url));
  return NextResponse.next();
}

export const config = {
  // Exclude /api/* from this page-redirect middleware. It was previously
  // catching POST /api/session/login (no session cookie yet, since that's
  // the endpoint that CREATES the cookie) and 307-redirecting it to the
  // /login PAGE, which only handles GET -> Next.js replied 405 with an
  // HTML error page, which the frontend then failed to JSON.parse
  // ("Unexpected token '<'"). API routes should return JSON on auth
  // failure themselves, not be redirected to an HTML page.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)']
};
