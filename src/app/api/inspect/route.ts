import { NextResponse } from "next/server";

// POST /api/inspect — stub; implemented in task 12
export async function POST() {
  return NextResponse.json(
    { error: "Not yet implemented" },
    { status: 501 }
  );
}
