import type { Block, InvoiceDraft } from '@ghost-hours/core';
import { billableBlocks, clipToPeriod } from '@ghost-hours/billing';
import { useApp } from '../state/store.tsx';
import { defensibilityScore, objectionsTo } from '../state/objections.ts';
import type { Objection, ObjectionKind } from '../state/objections.ts';
import { useI18n } from '../i18n/index.ts';
import type { MessageKey } from '../i18n/index.ts';

/**
 * « What a client could argue » (idea I-15).
 *
 * `objectionsTo` and `defensibilityScore` already wrote the answer; this panel
 * only turns it into markup. Objections are listed most severe first, each one
 * labelled with its translated sentence and a visible severity word (never
 * colour alone), and the defensibility score is shown as a number out of 100
 * with its explanation.
 */

const OBJECTION_KEYS: Readonly<Record<ObjectionKind, MessageKey>> = {
  unproven: 'objection.unproven',
  assumed: 'objection.assumed',
  'unresolved-conflict': 'objection.unresolved-conflict',
  'annex-too-short': 'objection.annex-too-short',
  'no-tax-rate': 'objection.no-tax-rate',
  'rounding-up': 'objection.rounding-up',
  'capped-day': 'objection.capped-day',
};

const SEVERITY_ORDER: Readonly<Record<Objection['severity'], number>> = {
  high: 0,
  medium: 1,
  low: 2,
};

const SEVERITY_KEY: Readonly<Record<Objection['severity'], MessageKey>> = {
  high: 'objection.severity.high',
  medium: 'objection.severity.medium',
  low: 'objection.severity.low',
};

function bySeverity(left: Objection, right: Objection): number {
  return SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
}

/** The confirmed and locked blocks of this draft, clipped to its period. */
function billableClientBlocks(state: ReturnType<typeof useApp>, draft: InvoiceDraft): readonly Block[] {
  return clipToPeriod(billableBlocks(state.blocks), draft.period).filter(
    (block) => block.clientId === draft.clientId,
  );
}

export interface ObjectionsProps {
  readonly draft: InvoiceDraft;
}

export function Objections(props: ObjectionsProps): JSX.Element {
  const { draft } = props;
  const state = useApp();
  const { t } = useI18n();

  const blocks = billableClientBlocks(state, draft);
  const objections = [...objectionsTo(state, draft, blocks)].sort(bySeverity);
  const score = defensibilityScore(state, draft, blocks, objections);

  return (
    <section className="card" aria-label={t('invoice.objections')}>
      <h3>{t('invoice.objections')}</h3>
      {objections.length === 0 ? (
        <p>{t('invoice.objectionsNone')}</p>
      ) : (
        <ul>
          {objections.map((objection) => (
            <ObjectionItem key={objection.kind} objection={objection} />
          ))}
        </ul>
      )}
      <p>
        {t('invoice.defensibility')}: <span className="numeric">{score} / 100</span>
      </p>
      <p>{t('invoice.defensibilityHint')}</p>
    </section>
  );
}

function ObjectionItem(props: { readonly objection: Objection }): JSX.Element {
  const { t } = useI18n();
  const { objection } = props;
  return (
    <li data-severity={objection.severity}>
      {t(SEVERITY_KEY[objection.severity])}: {t(OBJECTION_KEYS[objection.kind], objection.values)}
    </li>
  );
}