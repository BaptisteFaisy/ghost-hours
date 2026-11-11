import type { Block, DayRange } from '@ghost-hours/core';
import { useApp } from '../state/store.tsx';
import { clientById } from '../state/selectors.ts';
import { useI18n } from '../i18n/index.ts';

/**
 * The table view of the week (HEU-N-04): the same information as the grid,
 * but as a table — readable by a screen reader, printable, and reachable with
 * a single Tab.
 */

export interface WeekTableProps {
  readonly days: readonly DayRange[];
  readonly blocks: readonly Block[];
}

interface DayRowsProps {
  readonly day: DayRange;
  readonly blocks: readonly Block[];
}

/** The rows of one day: one per block, or a single "no block" row. */
function DayRows(props: DayRowsProps): JSX.Element {
  const state = useApp();
  const { t, formatTime, formatDuration, formatDay } = useI18n();
  const dayBlocks = props.blocks
    .filter((block) => block.start >= props.day.start && block.start < props.day.end)
    .sort((a, b) => a.start - b.start);
  if (dayBlocks.length === 0) {
    return (
      <tr>
        <th scope="row" data-day={props.day.dayKey}>
          {formatDay(props.day.dayKey)}
        </th>
        <td colSpan={5}>{t('week.noBlocks')}</td>
      </tr>
    );
  }
  return (
    <>
      {dayBlocks.map((block, index) => (
        <tr key={block.id} data-status={block.status}>
          <th scope="row" data-day={props.day.dayKey}>
            {index === 0 ? formatDay(props.day.dayKey) : ''}
          </th>
          <td>
            {formatTime(block.start)}–{formatTime(block.end)}
          </td>
          <td>{clientById(state, block.clientId)?.name ?? t('common.unknown')}</td>
          <td className="numeric">{formatDuration(minutesOf(block))}</td>
          <td>{t(`status.${block.status}`)}</td>
          <td className="numeric">{Math.round(block.provenShare * 100)}%</td>
        </tr>
      ))}
    </>
  );
}

function minutesOf(block: Block): number {
  return Math.max(0, Math.round((block.end - block.start) / 60_000));
}

export function WeekTable(props: WeekTableProps): JSX.Element {
  const { t } = useI18n();
  const statusHeader = t('a11y.statusOf', { status: '' }).trim();

  return (
    <table className="week-table" aria-label={t('a11y.weekTable')}>
      <caption className="visually-hidden">{t('a11y.weekTable')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('common.day')}</th>
          <th scope="col">{t('common.time')}</th>
          <th scope="col">{t('common.client')}</th>
          <th scope="col">{t('common.duration')}</th>
          <th scope="col">{statusHeader}</th>
          <th scope="col">{t('week.proven')}</th>
        </tr>
      </thead>
      <tbody>{props.days.map((day) => <DayRows key={day.dayKey} day={day} blocks={props.blocks} />)}</tbody>
    </table>
  );
}
