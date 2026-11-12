import { useMemo, useState } from 'react';
import type { Evidence, Instant } from '@ghost-hours/core';
import { addDaysInZone, monthRangeInZone, weekStartInZone } from '@ghost-hours/core';
import { useApp, useDispatch } from '../state/store.tsx';
import {
  blockById,
  clientById,
  conflictsOfWeek,
  evidenceOfBlock,
  weekBlocks,
  weekDays,
} from '../state/selectors.ts';
import { useI18n } from '../i18n/index.ts';
import { ConflictList } from '../components/ConflictList.tsx';
import { WeekGrid } from '../components/WeekGrid.tsx';
import { WeekTable } from '../components/WeekTable.tsx';
import { ManualBlockForm } from '../components/ManualBlockForm.tsx';

/**
 * The week screen (D.11): the grid of blocks, the gestures that settle them,
 * the panel of proofs of the selected block and the conflicts of the week.
 *
 * A day and a whole week are confirmed in one gesture: the review of a month
 * must stay under fifteen minutes (D.3).
 */

/** Which of the two equivalent views of the week the screen shows. */
export type WeekViewMode = 'grid' | 'table';

export function Week(): JSX.Element {
  const state = useApp();
  const { t } = useI18n();
  const timeZone = state.settings.timeZone;
  // The grid stays the default view (the e2e smoke contract expects it on
  // arrival); the choice lives for the whole session of the screen.
  const [viewMode, setViewMode] = useState<WeekViewMode>('grid');

  const weekStart = useMemo(
    () =>
      state.activeWeekStart ??
      defaultWeekStart(state.activeMonth.year, state.activeMonth.month, timeZone),
    [state.activeWeekStart, state.activeMonth, timeZone],
  );

  const days = weekDays(state, weekStart);
  const blocks = weekBlocks(state, weekStart);
  const conflicts = conflictsOfWeek(state, weekStart);
  const selected = state.selectedBlockId === null ? null : blockById(state, state.selectedBlockId);

  return (
    <section className="card week-screen" aria-label={t('week.title')}>
      <h2>{t('week.title')}</h2>
      <WeekToolbar weekStart={weekStart} days={days} />
      <ManualEntry days={days} />
      <DayButtons days={days} />
      <div className="week-views">
        <ViewToggle viewMode={viewMode} onChange={setViewMode} />
        {viewMode === 'grid' ? (
          <WeekGrid days={days} blocks={blocks} />
        ) : (
          <section className="week-table-section" aria-label={t('week.tableView')}>
            <h3>{t('week.tableView')}</h3>
            <WeekTable days={days} blocks={blocks} />
          </section>
        )}
      </div>
      <ConflictList conflicts={conflicts} />
      <EvidencePanel blockId={selected === null ? null : selected.id} />
    </section>
  );
}

/**
 * The week that the screen shows when nothing else is chosen: the week of the
 * active month that starts inside it, so the first days of the month are
 * visible.
 */
function defaultWeekStart(year: number, month: number, timeZone: string): Instant {
  const range = monthRangeInZone(year, month, timeZone);
  const start = weekStartInZone(range.start, timeZone);
  return start < range.start ? addDaysInZone(start, 7, timeZone) : start;
}

interface ViewToggleProps {
  readonly viewMode: WeekViewMode;
  readonly onChange: (mode: WeekViewMode) => void;
}

const VIEW_OPTIONS: readonly { mode: WeekViewMode; labelKey: 'week.gridView' | 'week.tableView' }[] = [
  { mode: 'grid', labelKey: 'week.gridView' },
  { mode: 'table', labelKey: 'week.tableView' },
];

/**
 * The explicit choice between the two equivalent views of the week
 * (HEU-N-04): one click switches, the pressed button carries `aria-pressed`.
 */
function ViewToggle(props: ViewToggleProps): JSX.Element {
  const { t } = useI18n();
  return (
    // TODO(i18n): no existing key names the group of view buttons; the label
    // is hardcoded in English until a key is added to en.ts / fr.ts.
    <div className="week-view-toggle" role="group" aria-label="Week display">
      {VIEW_OPTIONS.map((option) => (
        <button
          key={option.mode}
          type="button"
          aria-pressed={props.viewMode === option.mode}
          onClick={() => props.onChange(option.mode)}
        >
          {t(option.labelKey)}
        </button>
      ))}
    </div>
  );
}

interface WeekToolbarProps {
  readonly weekStart: Instant;
  readonly days: readonly { start: number }[];
}

/** The gesture that declares work no evidence shows (HEU-F-05). */
function ManualEntry(props: { days: readonly { dayKey: string }[] }): JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const dayKey = props.days[0]?.dayKey ?? '';
  return (
    <>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {t('week.addManual')}
      </button>
      {open && <ManualBlockForm dayKey={dayKey} onDone={() => setOpen(false)} />}
    </>
  );
}

function WeekToolbar(props: WeekToolbarProps): JSX.Element {
  const dispatch = useDispatch();
  const { t, formatDate } = useI18n();
  const timeZone = useApp().settings.timeZone;
  const first = props.days[0]?.start ?? props.weekStart;
  const last = props.days[props.days.length - 1]?.start ?? props.weekStart;
  return (
    <div className="week-toolbar">
      <button
        type="button"
        aria-label={t('week.previous')}
        onClick={() =>
          dispatch({
            type: 'setActiveWeek',
            weekStart: addDaysInZone(props.weekStart, -7, timeZone),
          })
        }
      >
        ← {t('week.previous')}
      </button>
      <span className="week-range">
        {formatDate(first)} — {formatDate(last)}
      </span>
      <button
        type="button"
        aria-label={t('week.next')}
        onClick={() =>
          dispatch({
            type: 'setActiveWeek',
            weekStart: addDaysInZone(props.weekStart, 7, timeZone),
          })
        }
      >
        {t('week.next')} →
      </button>
      <button
        type="button"
        className="primary"
        aria-label={t('week.confirmWeek')}
        onClick={() => dispatch({ type: 'confirmWeek', weekStart: props.weekStart })}
      >
        {t('week.confirmWeek')}
      </button>
    </div>
  );
}

interface DayButtonsProps {
  readonly days: readonly { dayKey: string }[];
}

/** One gesture per day: the whole day is confirmed at once (D.7 P5). */
function DayButtons(props: DayButtonsProps): JSX.Element {
  const dispatch = useDispatch();
  const { t, formatDay } = useI18n();
  return (
    <div className="week-days-actions">
      {props.days.map((day) => (
        <button
          key={day.dayKey}
          type="button"
          aria-label={`${t('week.confirmDay')} — ${formatDay(day.dayKey)}`}
          onClick={() => dispatch({ type: 'confirmDay', dayKey: day.dayKey })}
        >
          {t('week.confirmDay')} · {formatDay(day.dayKey)}
        </button>
      ))}
    </div>
  );
}

interface EvidencePanelProps {
  readonly blockId: string | null;
}

function EvidencePanel(props: EvidencePanelProps): JSX.Element {
  const state = useApp();
  const { t } = useI18n();
  const evidence = props.blockId === null ? [] : evidenceOfBlock(state, props.blockId);
  return (
    <section className="card evidence-panel" aria-label={t('evidence.title')}>
      <h3>{t('evidence.title')}</h3>
      {props.blockId === null ? (
        <p>{t('evidence.empty')}</p>
      ) : (
        <EvidenceList
          evidence={evidence}
          clientName={clientNameOf(state, props.blockId, t('common.unknown'))}
        />
      )}
    </section>
  );
}

function clientNameOf(state: ReturnType<typeof useApp>, blockId: string, fallback: string): string {
  const block = blockById(state, blockId);
  if (block === null) return fallback;
  return clientById(state, block.clientId)?.name ?? fallback;
}
interface EvidenceListProps {
  readonly evidence: readonly Evidence[];
  readonly clientName: string;
}

function EvidenceList(props: EvidenceListProps): JSX.Element {
  const { t, formatTime, formatDate } = useI18n();
  if (props.evidence.length === 0) return <p>{t('evidence.empty')}</p>;
  return (
    <>
      <p>{props.clientName}</p>
      <ul className="evidence-list">
        {props.evidence.map((item) => (
          <li key={item.id} className="evidence-item" data-source={item.source}>
            <span className="evidence-kind">{t(evidenceKey(item))}</span>
            <span className="evidence-when">{whenOf(item, formatDate, formatTime)}</span>
            <span className="evidence-what">{item.summary ?? item.title ?? item.text ?? ''}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function whenOf(
  item: Evidence,
  formatDate: (instant: number) => string,
  formatTime: (instant: number) => string,
): string {
  if (item.start !== undefined) {
    return `${formatDate(item.start)} ${formatTime(item.start)}–${formatTime(item.end ?? item.start)}`;
  }
  if (item.at !== undefined) return formatTime(item.at);
  return '';
}

function evidenceKey(
  item: Evidence,
): 'evidence.commit' | 'evidence.meeting' | 'evidence.note' | 'evidence.manual' {
  if (item.source === 'calendar') return 'evidence.meeting';
  if (item.source === 'note') return 'evidence.note';
  if (item.source === 'manual') return 'evidence.manual';
  return 'evidence.commit';
}
