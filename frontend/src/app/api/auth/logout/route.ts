// PULSE:OK — server-side proxy route, client callers invoke mutate('auth') after receiving this response
import { type NextRequest, NextResponse } from 'next/server';
import { clearSharedAuthCookies } from '../_lib/shared-auth-cookies';

export async function POST(request: NextRequest) {
  const res = NextResponse.json({ success: true });
  clearSharedAuthCookies(request, res);
  return res;
}
