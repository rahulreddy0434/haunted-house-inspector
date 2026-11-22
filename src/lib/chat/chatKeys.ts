export const CHAT_SK_PREFIX = 'CHAT#';
export const CHAT_SK_MAX = 'CHAT#999999';

/** Sort key of the chat message with the given sequence number (6 digits, zero padded). */
export function chatSk(seq: number): string {
  return CHAT_SK_PREFIX + String(seq).padStart(6, '0');
}
