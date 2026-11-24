import type { Ref } from 'react';
import { PAGE_TITLE } from '@/components/ui/styles';

export interface StepHeadingProps {
  headingRef?: Ref<HTMLHeadingElement>;
  children: string;
}

/** Step title. Focusable by script (`tabIndex={-1}`) so focus can move here when the step changes. */
export function StepHeading({ headingRef, children }: StepHeadingProps) {
  return (
    <h2 ref={headingRef} tabIndex={-1} className={`${PAGE_TITLE} focus:outline-none`}>
      {children}
    </h2>
  );
}
