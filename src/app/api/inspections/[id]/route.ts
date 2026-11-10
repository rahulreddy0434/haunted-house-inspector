import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getInspection } from '@/lib/aws/dynamodb';
import { inspectionResultSchema } from '@/lib/validation/inspectionSchema';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();
const NO_STORE = { 'Cache-Control': 'no-store' };

function notFound(): NextResponse {
  return NextResponse.json({ error: 'Inspection not found' }, { status: 404, headers: NO_STORE });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;

  // An invalid id is indistinguishable from a missing one, to avoid probing.
  if (!idSchema.safeParse(id).success) {
    return notFound();
  }

  let stored: unknown;
  try {
    stored = await getInspection(id);
  } catch (error: unknown) {
    console.error('Failed to load inspection', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json(
      { error: 'LOAD_FAILED', message: "We couldn't load this result. Please try again." },
      { status: 500, headers: NO_STORE },
    );
  }

  if (stored === null || stored === undefined) {
    return notFound();
  }

  const parsed = inspectionResultSchema.safeParse(stored);
  if (!parsed.success) {
    console.error(
      'Stored inspection failed validation',
      parsed.error.issues.map((issue) => issue.path.join('.')),
    );
    return NextResponse.json(
      { error: 'RESULT_INVALID', message: 'This result could not be loaded.' },
      { status: 500, headers: NO_STORE },
    );
  }

  return NextResponse.json(parsed.data, { status: 200, headers: NO_STORE });
}
