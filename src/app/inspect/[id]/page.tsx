import { ResultsView } from "@/components/results/ResultsView";

interface InspectPageProps {
  params: Promise<{ id: string }>;
}

export default async function InspectPage({ params }: InspectPageProps) {
  const { id } = await params;
  return <ResultsView id={id} />;
}
