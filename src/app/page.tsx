import { UploadFlow } from '@/components/upload/UploadFlow';

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-3xl font-bold text-brand-700 haunted:text-haunted-accent">
          Upload a photo or video of your problem
        </h1>
        <p className="mt-3 text-lg text-gray-700 haunted:text-haunted-muted">
          Add up to 5 photos or one short video (up to 30 seconds) and we will give you a likely
          cause, who to call and a rough cost range.
        </p>
      </header>
      <UploadFlow />
    </div>
  );
}
