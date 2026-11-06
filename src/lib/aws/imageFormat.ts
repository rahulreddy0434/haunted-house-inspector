export type ImageFormat = "jpeg" | "png" | "webp";

const CONTENT_TYPE_MAP: Record<string, ImageFormat> = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

const EXTENSION_MAP: Record<string, ImageFormat> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
};

/**
 * Resolves the Nova image format. The Content-Type header wins; otherwise the
 * S3 key's file extension is used. Throws if neither is recognised.
 */
export function resolveImageFormat(
  contentType: string | null | undefined,
  key: string,
): ImageFormat {
  if (contentType) {
    const mime = contentType.split(";")[0].trim().toLowerCase();
    const fromType = CONTENT_TYPE_MAP[mime];
    if (fromType) return fromType;
  }
  const match = /\.([a-z0-9]+)$/i.exec(key);
  const fromExt = match ? EXTENSION_MAP[match[1].toLowerCase()] : undefined;
  if (fromExt) return fromExt;
  throw new Error(
    `Unsupported image format for "${key}" (content-type: ${contentType ?? "none"}). Use JPEG, PNG or WebP.`,
  );
}
