const MAX_LENGTH = 100;
const DEFAULT_NAME = "upload";

/**
 * Reduces a user-supplied filename to a safe S3 key segment: basename only,
 * characters limited to [A-Za-z0-9._-], no "..", bounded length.
 */
export function sanitizeFilename(input: string): string {
  const base = input.split(/[\\/]/).pop() ?? "";
  let name = base
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/_{2,}/g, "_")
    .replace(/^[.]+/, "");
  if (name.length > MAX_LENGTH) {
    name = name.slice(0, MAX_LENGTH);
  }
  if (!name || /^[._-]+$/.test(name)) {
    return DEFAULT_NAME;
  }
  return name;
}
