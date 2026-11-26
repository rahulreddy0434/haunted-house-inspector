import { HelpSection } from '@/components/ui/help/HelpSection';
import { GuidedIntake } from '@/components/intake/GuidedIntake';

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 lg:max-w-[1120px] px-5 py-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="break-words text-[26px] font-bold leading-8 tracking-[-0.4px] text-normal-text haunted:text-haunted-accent">
          Upload a photo or video of your problem.
        </h1>
        <p className="text-[15px] leading-[22px] text-normal-muted haunted:text-haunted-muted">
          Add up to 5 photos, or one video up to 30 seconds.
        </p>
      </header>
      <GuidedIntake />
      <HelpSection page="/" />
    </div>
  );
}
