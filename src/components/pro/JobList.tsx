import type { ProJobListItem } from '@/types/job';
import { Button } from '@/components/ui/Button';
import { JobListItem } from '@/components/pro/JobListItem';
import { StateText } from '@/components/ui/haunted/StateText';
import { BODY, ERROR_TEXT } from '@/components/ui/styles';

export interface JobListProps {
  jobs: ProJobListItem[];
  /** First load in progress: shows "Loading jobs…". */
  loading?: boolean;
  /** Message shown with role="alert" above the kept list; null for none. */
  error: string | null;
  /** A request is in flight; disables Refresh. */
  refreshing: boolean;
  /** Called only when the user presses Refresh. */
  onRefresh: () => void;
}

export function JobList({ jobs, loading = false, error, refreshing, onRefresh }: JobListProps) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <Button variant="secondary" onClick={onRefresh} disabled={loading || refreshing}>
          Refresh
        </Button>
      </div>
      {error ? (
        <p role="alert" className={`${ERROR_TEXT} whitespace-pre-wrap break-words`}>
          {error}
        </p>
      ) : null}
      {loading ? (
        <StateText
          plain="Loading jobs…"
          hauntedKey="jobsLoading"
          role="status"
          className={BODY}
        />
      ) : jobs.length === 0 ? (
        <StateText plain="No jobs yet." hauntedKey="noJobs" className={BODY} />
      ) : (
        <ul className="flex flex-col gap-3">
          {jobs.map((job) => (
            <JobListItem key={job.id} job={job} />
          ))}
        </ul>
      )}
    </section>
  );
}
