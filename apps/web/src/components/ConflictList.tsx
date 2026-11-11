import type { Block, Conflict, Evidence } from '@ghost-hours/core';
import { useApp, useDispatch } from '../state/store.tsx';
import { blockById, clientById } from '../state/selectors.ts';
import { useI18n } from '../i18n/index.ts';
import { Stitch } from './Stitch.tsx';

/**
 * The conflicts of the week (D.5 step 7, HEU-F-14): two blocks of two
 * different clients cover the same minutes. The screen never decides for the
 * user — it says what contradicts what, shows the proofs in cause, and offers
 * the two arbitrations: keep this one, or keep that one.
 */

export interface ConflictListProps {
  readonly conflicts: readonly Conflict[];
}

interface ConflictRowProps {
  readonly conflict: Conflict;
}

function evidenceOfConflict(state: ReturnType<typeof useApp>, conflict: Conflict): readonly Evidence[] {
  return conflict.evidenceIds
    .map((id) => state.evidence.find((item) => item.id === id))
    .filter((item): item is Evidence => item !== undefined);
}

export function ConflictList(props: ConflictListProps): JSX.Element {
  const { t } = useI18n();
  if (props.conflicts.length === 0) {
    return (
      <section className="card conflict-list" aria-label={t('week.resolveConflict')}>
        <h2>{t('week.resolveConflict')}</h2>
        <p>{t('common.none')}</p>
      </section>
    );
  }
  return (
    <section className="card conflict-list" aria-label={t('week.resolveConflict')}>
      <h2>{t('week.resolveConflict')}</h2>
      {props.conflicts.map((conflict) => (
        <ConflictRow key={conflict.id} conflict={conflict} />
      ))}
    </section>
  );
}

function ConflictRow(props: ConflictRowProps): JSX.Element {
  const { conflict } = props;
  const state = useApp();
  const dispatch = useDispatch();
  const { t, formatTime, formatDuration } = useI18n();
  const blocks = conflict.blockIds
    .map((id) => blockById(state, id))
    .filter((block): block is Block => block !== null);
  const evidence = evidenceOfConflict(state, conflict);
  const nameOf = (block: Block): string => clientById(state, block.clientId)?.name ?? t('common.unknown');

  return (
    <article className="conflict" aria-label={`${t('week.resolveConflict')} — ${conflict.reason}`}>
      <p className="conflict-reason">{conflict.reason}</p>
      <p className="conflict-span">
        {formatTime(conflict.start)}–{formatTime(conflict.end)} ·{' '}
        {formatDuration(Math.round((conflict.end - conflict.start) / 60_000))}
      </p>
      <ul className="conflict-blocks">
        {blocks.map((block) => (
          <li key={block.id} className="conflict-block" data-status={block.status}>
            <span>
              {formatTime(block.start)}–{formatTime(block.end)} · {nameOf(block)} ·{' '}
              {t(`status.${block.status}`)}
            </span>
            <button
              type="button"
              className="primary"
              aria-label={`${t('week.resolveConflict')} — ${nameOf(block)} — ${formatTime(block.start)}`}
              onClick={() =>
                dispatch({ type: 'resolveConflict', conflictId: conflict.id, keepBlockId: block.id })
              }
            >
              {nameOf(block)} · {formatTime(block.start)}
            </button>
          </li>
        ))}
      </ul>
      <Stitch evidence={evidence} />
    </article>
  );
}
