interface InspectPageProps {
  params: Promise<{ id: string }>;
}

export default async function InspectPage({ params }: InspectPageProps) {
  const { id } = await params;

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <h1 className="text-2xl font-bold">Inspection Results</h1>
      <p className="mt-2 text-sm text-gray-500">Job ID: {id}</p>
      {/* Results components will be composed here in later tasks */}
    </main>
  );
}
