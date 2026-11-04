import { NextResponse } from "next/server";

// GET /api/inspections — stub; implemented in task 13
export async function GET() {
  return NextResponse.json(
    { error: "Not yet implemented" },
    { status: 501 }
  );
}
