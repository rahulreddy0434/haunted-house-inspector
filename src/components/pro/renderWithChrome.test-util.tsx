import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ProChromeProvider } from '@/components/pro/ProChromeContext';
import { SiteHeader } from '@/components/ui/SiteHeader';

/** Renders the page with the root-layout header so header-level controls are visible. */
export function renderWithChrome(ui: ReactElement) {
  return render(
    <ProChromeProvider>
      <SiteHeader />
      {ui}
    </ProChromeProvider>,
  );
}
