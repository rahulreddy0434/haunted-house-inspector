export interface EmergencyReasonLineProps {
  sentence?: string;
}

/**
 * The fixed one-line reason on an Emergency_Page. Plain style, no `haunted:` class and no theme
 * variant, so it looks the same in every theme. Renders nothing when there is no sentence.
 */
export function EmergencyReasonLine({ sentence }: EmergencyReasonLineProps) {
  if (!sentence) return null;
  return <p className="text-base font-medium text-normal-text">{sentence}</p>;
}
