import type { Block, Conflict, Evidence, Minutes } from '@ghost-hours/core';
import { msToWholeMinutes } from '@ghost-hours/core';
import { useApp, useDispatch } from '../state/store.tsx';
import { BlockReason as BlockReasonLine } from '../components/ReasonLine.tsx';
import { blockById, clientById, overloadedDays } from '../state/selectors.ts';
import { useI18n } from '../i18n/index.ts';
import type { AppState } from '../state/types.ts';

/**
 * The contradictions screen (idea P-06 / A-09): every unresolved conflict of
 * the month, not only the visible week. The tool never decides for the user:
 * it shows both sides with their proofs and their structured reason, and
 * offers three gestures — keep one side, keep the other, or share the minutes
 * (`splitConflict`, the decision survives the next reconstruction).
 */

/** Conflicts in a deterministic order: by start, then by id (HEU-F-16). */
function sortedConflicts(conflicts: readonly Conflict[]): readonly Conflict[] {
  return [...conflicts].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

export function Conflicts(): JSX.Element {
  const state = useApp();
  const { t } = useI18n();
  const sorted = sortedConflicts(state.conflicts);
  const open = sorted.filter((conflict) => !conflict.resolved);
  const settled = sorted.filter((conflict) => conflict.resolved);
  return (
    <section className="card conflicts-screen" aria-label={t('conflicts.title')}>
      <h2>{t('conflicts.title')}</h2>
      <p>{t('conflicts.explainer')}</p>
      {open.length === 0 && <p>{t('conflicts.empty')}</p>}
      {[...open, ...settled].map((conflict) => (
        <ConflictSection
          key={conflict.id}
          conflict={conflict}
          index={open.findIndex((item) => item.id === conflict.id) + 1}
          total={open.length}
        />
      ))}
      <OverloadSection />
    </section>
  );
}

/**
 * The second kind of contradiction, and the one a conflict block cannot show:
 * a day that holds more counted time than one working day, across every client.
 * The product does not settle it either — it names the days and the hours, and
 * leaves the reviewer look at the evidence.
 */
function OverloadSection(): JSX.Element {
  const { t, formatDay, formatDuration } = useI18n();
  const state = useApp();
  const days = overloadedDays(state);
  const threshold = formatDuration(state.settings.dayLengthMinutes);
  return (
    <section className="overload-panel" aria-label={t('overload.title')}>
      <h3>{t('overload.title')}</h3>
      <p>{t('overload.explain', { threshold })}</p>
      {days.length === 0 ? (
        <p>{t('overload.none')}</p>
      ) : (
        <ul>
          {days.map((day) => (
            <li key={day.dayKey}>
              {t('overload.day', {
                date: formatDay(day.dayKey),
                hours: formatDuration(day.totalMinutes),
                threshold: formatDuration(day.thresholdMinutes),
              })}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface ConflictSectionProps {
  readonly conflict: Conflict;
  readonly index: number;
  readonly total: number;
}

function blocksOf(state: AppState, conflict: Conflict): readonly Block[] {
  return conflict.blockIds
    .map((id) => blockById(state, id))
    .filter((block): block is Block => block !== null);
}

function evidenceByIds(state: AppState, ids: readonly string[]): readonly Evidence[] {
  return ids
    .map((id) => state.evidence.find((item) => item.id === id))
    .filter((item): item is Evidence => item !== undefined);
}

/** One contradiction: the two sides, the proofs in cause, the three gestures. */
function ConflictSection(props: ConflictSectionProps): JSX.Element {
  const state = useApp();
  const { t, formatTime } = useI18n();
  const { conflict } = props;
  const blocks = blocksOf(state, conflict);
  const range = `${formatTime(conflict.start)}–${formatTime(conflict.end)}`;
  return (
    <section className="card conflict" aria-label={`${t('conflicts.title')} — ${range}`}>
      <h3>{range}</h3>
      {!conflict.resolved && (
        <p className="numeric" aria-live="polite">
          {t('conflicts.position', { index: props.index, total: props.total })}
        </p>
      )}
      {conflict.resolved && <p>{t('conflicts.settled')}</p>}
      <ConflictBlocks blocks={blocks} />
      <ConflictEvidence evidence={evidenceByIds(state, conflict.evidenceIds)} />
      {!conflict.resolved && <ConflictGestures conflict={conflict} blocks={blocks} />}
    </section>
  );
}

/** The two sides of the contradiction, side by side. */
function ConflictBlocks(props: { blocks: readonly Block[] }): JSX.Element {
  return (
    <div className="conflict-blocks">
      {props.blocks.map((block) => (
        <BlockSide key={block.id} block={block} />
      ))}
    </div>
  );
}

function totalMinutes(block: Block): Minutes {
  return msToWholeMinutes(block.end - block.start);
}

function provenMinutes(block: Block): Minutes {
  return Math.max(0, totalMinutes(block) - Math.min(block.assumedLeadInMinutes, totalMinutes(block)));
}

function BlockSide(props: { block: Block }): JSX.Element {
  const state = useApp();
  const { t, formatTime, formatDuration } = useI18n();
  const { block } = props;
  const clientName = clientById(state, block.clientId)?.name ?? block.clientId;
  return (
    <div className="block" data-status={block.status}>
      <div className="block-heading">
        <span className="block-client">
          <span className="visually-hidden">{t('common.client')}: </span>
          {clientName}
        </span>
        <span className="block-status">{t(`status.${block.status}`)}</span>
        <span className="block-times numeric">
          {formatTime(block.start)}–{formatTime(block.end)} · {formatDuration(totalMinutes(block))}
        </span>
      </div>
      <div className="block-parts">
        <span>{t('week.proven')}: {formatDuration(provenMinutes(block))}</span>
        <span>{t('week.assumed')}: {formatDuration(Math.min(block.assumedLeadInMinutes, totalMinutes(block)))}</span>
      </div>
      <BlockReasonLine block={block} />
    </div>
  );
}

/** The proofs in cause: instant, then repo/branch/summary or meeting title. */
function ConflictEvidence(props: { evidence: readonly Evidence[] }): JSX.Element {
  const { t, formatDate, formatTime } = useI18n();
  return (
    <section aria-label={t('conflicts.evidence')}>
      <h4>{t('conflicts.evidence')}</h4>
      <ul className="evidence-list">
        {props.evidence.map((item) => (
          <li key={item.id} className="evidence-item" data-source={item.source}>
            <span className="evidence-when">{evidenceWhen(item, formatDate, formatTime)}</span>
            <span className="evidence-what">{evidenceWhat(item)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function evidenceWhen(
  item: Evidence,
  formatDate: (instant: number) => string,
  formatTime: (instant: number) => string,
): string {
  const instant = item.at ?? item.start;
  return instant === undefined ? '' : `${formatDate(instant)} ${formatTime(instant)}`;
}

function evidenceWhat(item: Evidence): string {
  if (item.kind === 'meeting') return item.title ?? '';
  const parts = [item.repo, item.branch, item.summary ?? item.text].filter(
    (part): part is string => part !== undefined && part !== '',
  );
  return parts.join(' · ');
}

interface ConflictGesturesProps {
  readonly conflict: Conflict;
  readonly blocks: readonly Block[];
}

/** The three gestures: keep one side, keep the other, or share the minutes. */
function ConflictGestures(props: ConflictGesturesProps): JSX.Element {
  const state = useApp();
  const dispatch = useDispatch();
  const { t, formatTime } = useI18n();
  return (
    <div className="block-actions">
      {props.blocks.map((block) => {
        const clientName = clientById(state, block.clientId)?.name ?? block.clientId;
        const label = `${t('conflicts.keep', { client: clientName })} — ${formatTime(block.start)}`;
        return (
          <button
            key={block.id}
            type="button"
            className="primary"
            aria-label={label}
            onClick={() =>
              dispatch({
                type: 'resolveConflict',
                conflictId: props.conflict.id,
                keepBlockId: block.id,
              })
            }
          >
            {t('conflicts.keep', { client: clientName })}
          </button>
        );
      })}
      <button
        type="button"
        aria-label={t('conflicts.split')}
        onClick={() => dispatch({ type: 'splitConflict', conflictId: props.conflict.id })}
      >
        {t('conflicts.split')}
      </button>
      <p>{t('conflicts.splitExplainer')}</p>
    </div>
  );
}
