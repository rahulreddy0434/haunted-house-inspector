import { SECONDARY_BUTTON } from '@/components/ui/styles';

export interface SampleButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function SampleButton({ onClick, disabled }: SampleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 min-w-11 rounded-lg px-4 py-2 text-base font-medium disabled:cursor-not-allowed disabled:opacity-60 ${SECONDARY_BUTTON}`}
    >
      Try it with a sample photo
    </button>
  );
}
