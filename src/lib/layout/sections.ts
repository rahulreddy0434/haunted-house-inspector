/**
 * Layout_Definition: the single source of truth for section order.
 *
 * Pure data, no rendering. One DOM order serves both layouts: the phone list
 * equals the desktop left column followed by the right column (with the
 * above-column `back-link` first and the full-width `help` last where they
 * exist). No CSS reordering is used.
 */

export type HomeSectionId = 'current-step' | 'inspection-panel'

export type ResultsSectionId =
  | 'back-link'
  | 'urgency-meter'
  | 'issue-title'
  | 'likely-diagnosis-line'
  | 'who-to-call'
  | 'likely-cost'
  | 'job-brief'
  | 'questions'
  | 'safe-things'
  | 'chat'
  | 'job-tracker'
  | 'booking'
  | 'notice-copy-link'
  | 'help'

export type ProJobSectionId =
  | 'job-brief'
  | 'photos'
  | 'answers'
  | 'chat'
  | 'trade'
  | 'likely-cost'
  | 'ai-confidence'
  | 'respond-panel'
  | 'help'

export type SectionId = HomeSectionId | ResultsSectionId | ProJobSectionId

export interface LayoutDefinition<T extends SectionId> {
  readonly phone: readonly T[]
  readonly desktop: {
    readonly left: readonly T[]
    readonly right: readonly T[]
  }
}

/** Home page: current Step on the left, Inspection_Panel on the right. */
export const HOME_LAYOUT: LayoutDefinition<HomeSectionId> = {
  phone: ['current-step', 'inspection-panel'],
  desktop: {
    left: ['current-step'],
    right: ['inspection-panel'],
  },
}

/**
 * Results page. Desktop: `back-link` sits above the columns and `help` runs
 * full width below them, so back-link + left + right + help equals phone.
 */
export const RESULTS_LAYOUT: LayoutDefinition<ResultsSectionId> = {
  phone: [
    'back-link',
    'urgency-meter',
    'issue-title',
    'likely-diagnosis-line',
    'who-to-call',
    'likely-cost',
    'job-brief',
    'questions',
    'safe-things',
    'chat',
    'job-tracker',
    'booking',
    'notice-copy-link',
    'help',
  ],
  desktop: {
    left: [
      'urgency-meter',
      'issue-title',
      'likely-diagnosis-line',
      'who-to-call',
      'likely-cost',
      'job-brief',
      'questions',
      'safe-things',
      'chat',
    ],
    right: ['job-tracker', 'booking', 'notice-copy-link'],
  },
}

/** Pro job page (non-emergency). `help` runs last, full width on desktop. */
export const PRO_JOB_LAYOUT: LayoutDefinition<ProJobSectionId> = {
  phone: [
    'job-brief',
    'photos',
    'answers',
    'chat',
    'trade',
    'likely-cost',
    'ai-confidence',
    'respond-panel',
    'help',
  ],
  desktop: {
    left: ['job-brief', 'photos', 'answers', 'chat'],
    right: ['trade', 'likely-cost', 'ai-confidence', 'respond-panel'],
  },
}
