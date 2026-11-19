import type { HTMLAttributes, Ref } from 'react';
import { Cobweb } from '@/components/ui/haunted/Cobweb';
import { CARD, CARD_HAUNTED_ONLY, CARD_SHELL, STATUS_BOX } from '@/components/ui/styles';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'article';
  /**
   * `card` / `status`: shared recipe.
   * `bare`: shell only (positioning for the Cobweb). The caller supplies colours, padding and radius.
   * `haunted`: the card look applies in the Haunted theme only; Normal keeps the caller's classes.
   */
  tone?: 'card' | 'status' | 'bare' | 'haunted';
  /** React 19 passes `ref` as a prop; it reaches the rendered element through `rest`. */
  ref?: Ref<HTMLDivElement>;
}

const RECIPES = {
  card: CARD,
  status: STATUS_BOX,
  bare: CARD_SHELL,
  haunted: CARD_HAUNTED_ONLY,
} as const;

export function Card({
  as: Tag = 'div',
  tone = 'card',
  className,
  children,
  ...rest
}: CardProps) {
  const classes = [RECIPES[tone], className].filter(Boolean).join(' ');
  return (
    <Tag data-card="" className={classes} {...rest}>
      <Cobweb />
      {children}
    </Tag>
  );
}
