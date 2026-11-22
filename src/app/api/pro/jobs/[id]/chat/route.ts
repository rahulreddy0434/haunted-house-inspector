import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';
import { runChatRead, runChatSend } from '@/lib/chat/chatRoute';

export const runtime = 'nodejs';

// The Side is fixed here, never taken from the request. The shared pipelines
// call requirePro before parsing the body, validating the id or reading DynamoDB.

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  return runChatRead(request, id, 'tradesperson');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  return runChatSend(request, id, 'tradesperson');
}
