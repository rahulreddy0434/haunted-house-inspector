import type { Metadata } from 'next';
import { ProDashboard } from '@/components/pro/ProDashboard';

export const metadata: Metadata = {
  title: 'Tradesperson dashboard',
  robots: { index: false, follow: false },
};

export default function ProPage() {
  return <ProDashboard />;
}
