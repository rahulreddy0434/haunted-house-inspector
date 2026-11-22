import { TimeText } from '@/components/ui/TimeText';
import { CARD, MUTED, STATUS_BOX } from '@/components/ui/styles';
import type { ChatMessage, ChatSide } from '@/types/chat';

export interface ChatBubbleProps {
  message: ChatMessage;
  /** The viewer's Side. A message from the same Side is labelled "You". */
  viewerSide: ChatSide;
}

/** Sender label in words, so the sender never depends on colour or position. */
export function senderLabel(sender: ChatSide, viewerSide: ChatSide): string {
  if (sender === viewerSide) return 'You';
  return sender === 'homeowner' ? 'Homeowner' : 'Tradesperson';
}

export function ChatBubble({ message, viewerSide }: ChatBubbleProps) {
  const own = message.side === viewerSide;
  const surface = own ? STATUS_BOX : CARD;
  return (
    <li className={`min-w-0 rounded-lg ${surface}`}>
      <p className={`break-words text-sm font-medium ${MUTED}`}>
        <span>{senderLabel(message.side, viewerSide)}</span>
        {' · '}
        <TimeText iso={message.sentAt} />
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words">{message.text}</p>
    </li>
  );
}
