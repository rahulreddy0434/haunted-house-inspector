import 'server-only';

import type { NextResponse } from 'next/server';
import { runChatRead, runChatSend } from '@/lib/chat/chatRoute';

export const runtime = 'nodejs';

// The Side is fixed to 'homeowner' here. It is never read from the request,
// and the Job id is the only authorisation (no Pro cookie).

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  return runChatRead(request, id, 'homeowner');
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  return runChatSend(request, id, 'homeowner');
}
