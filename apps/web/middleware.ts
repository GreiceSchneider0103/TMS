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
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
