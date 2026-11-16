import type { Metadata } from 'next';
import { JobDetail } from '@/components/pro/JobDetail';

export const metadata: Metadata = {
  title: 'Job details',
  robots: { index: false, follow: false },
};

interface ProJobPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProJobPage({ params }: ProJobPageProps) {
  const { id } = await params;
  return <JobDetail id={id} />;
}
