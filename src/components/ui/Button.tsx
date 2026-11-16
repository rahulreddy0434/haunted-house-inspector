import type { ButtonHTMLAttributes } from 'react';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/ui/styles';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

const BASE =
  'min-h-11 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60';

export function Button({
  variant = 'primary',
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const recipe = variant === 'primary' ? PRIMARY_BUTTON : SECONDARY_BUTTON;
  const classes = [BASE, recipe, className].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
