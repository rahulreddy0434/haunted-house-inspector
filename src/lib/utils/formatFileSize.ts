/** File size in MB with one decimal place, e.g. "2.4 MB". 1 MB is 1,048,576 bytes. */
export function formatFileSize(bytes: number): string {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  return `${(safe / 1_048_576).toFixed(1)} MB`;
}
