/** Haunted wording. Kept apart from src/lib/jobs/copy.ts; shares no string with it. */
export const HAUNTED_COPY = {
  inspecting: 'The inspector is walking the halls…',
  resultLoading: 'Summoning your result from the shadows…',
  statusChecking: 'Listening for whispers from the tradesperson…',
  jobLoading: 'Lighting a candle to find the job…',
  jobsLoading: 'Rattling the chains to fetch your jobs…',
  noFiles: 'No spirits caught yet.',
  noJobs: 'No restless spirits in the queue yet.',
} as const;

export type HauntedCopyKey = keyof typeof HAUNTED_COPY;
