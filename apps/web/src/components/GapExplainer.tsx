import { useApp } from '../state/store.tsx';
import { explainGap } from '../state/insight.ts';
import type { GapCauseKind } from '../state/insight.ts';
import { useI18n } from '../i18n/index.ts';
import type { MessageKey } from '../i18n/index.ts';
import { formatHoursShort } from './format.ts';

/**
 * Where the ghost hours come from (idea I-01), rendered on the month screen.
 *
 * `explainGap` already wrote the answer: this panel only turns it into markup.
 * Each cause is a line of an accessible list, labelled with its translation and
 * its duration, so the meaning never rides on colour alone. The title carries
 * the total ghost hours, and the unexplained remainder is stated in words, not
 * left for the reader to subtract.
 */

const CAUSE_KEYS: Readonly<Record<GapCauseKind, MessageKey>> = {
  evening: 'gap.evening',
  weekend: 'gap.weekend',
  meeting: 'gap.meeting',
  assumed: 'gap.assumed',
  other: 'gap.other',
};

/** True once the user has declared at least one hour, anywhere in the state. */
function hasDeclaredHours(state: ReturnType<typeof useApp>): boolean {
  return Object.values(state.declaredMinutes).some((value) => value !== null);
}

export function GapExplainer(): JSX.Element {
  const state = useApp();
  const { t, locale, formatDuration } = useI18n();

  if (!hasDeclaredHours(state)) {
    return (
      <section className="card" aria-live="polite">
        <h3>{t('month.gapTitle', { hours: formatHoursShort(0, locale) })}</h3>
        <p>{t('month.gapEmpty')}</p>
      </section>
    );
  }

  const gap = explainGap(state, null);

  return (
    <section className="card" aria-live="polite">
      <h3>{t('month.gapTitle', { hours: formatHoursShort(gap.ghostMinutes, locale) })}</h3>
      <ul>
        {gap.causes.map((cause) => (
          <li key={cause.kind}>
            {t(CAUSE_KEYS[cause.kind])} <span className="numeric">{formatDuration(cause.minutes)}</span>
          </li>
        ))}
        {gap.unexplainedMinutes > 0 && (
          <li>
            {t('month.gapUnexplained')}{' '}
            <span className="numeric">{formatDuration(gap.unexplainedMinutes)}</span>
          </li>
        )}
      </ul>
    </section>
  );
}