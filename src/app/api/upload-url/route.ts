import "server-only";

import { NextResponse } from "next/server";
import { getUploadPresignedUrl } from "@/lib/aws/s3";
import { sanitizeFilename } from "@/lib/utils/sanitizeFilename";
import { uploadUrlRequestSchema } from "@/lib/validation/uploadSchema";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const parsed = uploadUrlRequestSchema.safeParse({
    filename: params.get("filename") ?? undefined,
    contentType: params.get("contentType") ?? undefined,
    inspectionId: params.get("inspectionId") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_REQUEST",
        message:
          "We couldn't read that upload request. Please use a JPEG, PNG or WebP photo, or an MP4 or WebM video.",
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const { filename, contentType, inspectionId } = parsed.data;
  const key = `${inspectionId}/${sanitizeFilename(filename)}`;

  try {
    const url = await getUploadPresignedUrl(key, contentType);
    return NextResponse.json({ url, key }, { status: 200, headers: NO_STORE });
  } catch (err) {
    console.error(
      "upload-url: failed to create pre-signed URL:",
      err instanceof Error ? err.message : "unknown error",
    );
    return NextResponse.json(
      {
        error: "UPLOAD_URL_FAILED",
        message: "We couldn't prepare your upload. Please try again.",
      },
      { status: 500, headers: NO_STORE },
    );
  }
}
