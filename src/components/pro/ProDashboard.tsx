'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { BODY, PAGE_TITLE } from '@/components/ui/styles';
import { AccessCodeForm } from '@/components/pro/AccessCodeForm';
import { JobList } from '@/components/pro/JobList';
import { useProJobs } from '@/hooks/useProJobs';
import { resetProSession } from '@/hooks/proSession';
import { SESSION_ENDED_NOTICE } from '@/lib/jobs/copy';

const DISABLED_MESSAGE = "Tradesperson access isn't available right now.";

type DashboardView = 'checking' | 'form' | 'disabled' | 'list';

interface DashboardBodyProps {
  /** Called after a successful login so the parent remounts this body and reloads the list. */
  onLoggedIn: () => void;
}

function DashboardBody({ onLoggedIn }: DashboardBodyProps) {
  const { phase, jobs, error, errorStatus, refreshing, sessionLost, refresh } = useProJobs();
  const [loggedOut, setLoggedOut] = useState(false);
  const [formDisabled, setFormDisabled] = useState(false);

  let view: DashboardView;
  if (formDisabled || errorStatus === 503) view = 'disabled';
  else if (loggedOut || phase === 'unauthorized') view = 'form';
  else if (phase === 'loading') view = 'checking';
  else view = 'list';

  async function logOut() {
    try {
      await fetch('/api/pro/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      // Show the form even if the request failed.
    }
    resetProSession();
    setLoggedOut(true);
  }

  if (view === 'checking') {
    return (
      <p role="status" className={BODY}>
        Loading jobs…
      </p>
    );
  }
  if (view === 'disabled') {
    return (
      <p role="status" className={BODY}>
        {DISABLED_MESSAGE}
      </p>
    );
  }
  if (view === 'form') {
    return (
      <AccessCodeForm
        onSuccess={onLoggedIn}
        onDisabled={() => setFormDisabled(true)}
        notice={sessionLost && !loggedOut ? SESSION_ENDED_NOTICE : undefined}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="secondary" onClick={() => void logOut()}>
          Log out
        </Button>
      </div>
      <JobList jobs={jobs} error={error} refreshing={refreshing} onRefresh={refresh} />
    </div>
  );
}

export function ProDashboard() {
  const [generation, setGeneration] = useState(0);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <h1 className={`${PAGE_TITLE} break-words`}>Tradesperson dashboard</h1>
      <DashboardBody key={generation} onLoggedIn={() => setGeneration((g) => g + 1)} />
    </div>
  );
}
