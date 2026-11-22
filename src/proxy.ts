// Passes the requested path to the root layout, which keeps Keel in setup mode while a startup check fails
// (REQ-005, CR-0012). Proxy stays light: no file or network access here.
import { NextResponse, type NextRequest } from 'next/server';

export const KEEL_PATH_HEADER = 'x-keel-path';

export function proxy(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set(KEEL_PATH_HEADER, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!_next/|api/|favicon|keel-logo).*)'] };
