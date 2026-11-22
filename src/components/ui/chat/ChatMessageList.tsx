import { ChatBubble } from '@/components/ui/chat/ChatBubble';
import { MUTED } from '@/components/ui/styles';
import type { ChatMessage, ChatSide } from '@/types/chat';

export interface ChatMessageListProps {
  messages: ChatMessage[];
  viewerSide: ChatSide;
}

export const CHAT_EMPTY_TEXT = 'No messages yet.';

/** The conversation, oldest first, so the newest message is at the bottom. */
export function ChatMessageList({ messages, viewerSide }: ChatMessageListProps) {
  if (messages.length === 0) {
    return <p className={MUTED}>{CHAT_EMPTY_TEXT}</p>;
  }
  return (
    <ol aria-label="Conversation" className="m-0 list-none space-y-3 p-0">
      {messages.map((message) => (
        <ChatBubble key={message.id} message={message} viewerSide={viewerSide} />
      ))}
    </ol>
  );
}
