import { describe, it, expect } from 'vitest';

import { EMERGENCY_MESSAGE, PRO_EMERGENCY_NOTE } from '@/lib/emergency/messages';

describe('emergency messages', () => {
  it('EMERGENCY_MESSAGE equals the exact Glossary literal', () => {
    expect(EMERGENCY_MESSAGE).toBe(
      'This may be dangerous. Get everyone to safety and call 911. For a gas smell, leave the home first, then call 911 or your gas utility from outside.',
    );
  });

  it('PRO_EMERGENCY_NOTE equals the exact Glossary literal', () => {
    expect(PRO_EMERGENCY_NOTE).toBe('Emergency: the homeowner was told to call 911');
  });
});
