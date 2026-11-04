export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold text-brand-700 haunted:text-haunted-accent">
        Haunted House Inspector
      </h1>
      <p className="mt-4 text-lg text-gray-600 haunted:text-haunted-muted">
        Upload a photo or video of your problem.
      </p>
    </main>
  );
}
