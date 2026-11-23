import type { NextRequest, NextResponse } from 'next/server';
import { handleHelp } from '@/lib/help/handleHelp';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleHelp(request);
}
