import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MutableRefObject } from 'react';
import type { Block, DayRange } from '@ghost-hours/core';
import { formatClockInZone, zonedParts } from '@ghost-hours/core';
import { useApp, useDispatch } from '../state/store.tsx';
import { evidenceOfBlock } from '../state/selectors.ts';
import { useI18n } from '../i18n/index.ts';
import { BlockCard } from './BlockCard.tsx';
import { assignLanes } from './weekLayout.ts';

/**
 * The week grid (D.11): `role="grid"`, one column per day over an hourly time
 * axis (07:00–20:00). Every block is placed in absolute position inside its
 * day column: `top` and `height` follow its own bounds (one hour = 48 px), and
 * blocks that overlap share the column width in sub-columns (lanes).
 *
 * Keyboard: the arrows move the focus from hour to hour and day to day,
 * `Enter` opens the first block that covers the focused hour, `Escape` closes
 * the selection.
 */

/** The visible day of the grid runs from 07:00 to 20:00. */
export const GRID_START_HOUR = 7;
export const GRID_END_HOUR = 20;
/** One hour of the axis, in pixels. */
export const HOUR_PX = 48;

export const GRID_HOURS = GRID_END_HOUR - GRID_START_HOUR;

export interface WeekGridProps {
  readonly days: readonly DayRange[];
  readonly blocks: readonly Block[];
}

interface Cursor {
  readonly row: number;
  readonly col: number;
}

interface PlacedBlock {
  readonly block: Block;
  readonly lane: number;
  readonly lanes: number;
  readonly topPx: number;
  readonly heightPx: number;
}

function blocksOfDay(dayBlocks: readonly Block[], day: DayRange): readonly Block[] {
  return dayBlocks.filter((block) => block.start >= day.start && block.start < day.end);
}

/** Minutes from midnight of the day the instant falls in, through core helpers. */
function minutesOfDay(instant: number, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  return parts.hour * 60 + parts.minute;
}

function offsetFromAxisStart(minutes: number): number {
  return minutes - GRID_START_HOUR * 60;
}

function pxOf(minutes: number): number {
  return (minutes / 60) * HOUR_PX;
}

/** Place one day's blocks on the hour axis, clamped to the visible window. */
function placeDay(dayBlocks: readonly Block[], timeZone: string): readonly PlacedBlock[] {
  const laid = assignLanes(dayBlocks, timeZone);
  const laneTotals = new Map<number, number>();
  for (const item of laid) {
    laneTotals.set(item.lane, (laneTotals.get(item.lane) ?? 0) + 1);
  }
  const lanes = Math.max(1, ...[...laneTotals.keys()].map((lane) => lane + 1));
  return laid.map((item) => placeBlock(item, lanes, timeZone));
}

function placeBlock(
  item: { block: Block; lane: number },
  lanes: number,
  timeZone: string,
): PlacedBlock {
  const startMin = Math.max(offsetFromAxisStart(minutesOfDay(item.block.start, timeZone)), 0);
  const endMin = Math.min(
    offsetFromAxisStart(minutesOfDay(item.block.end, timeZone)),
    GRID_HOURS * 60,
  );
  const span = Math.max(endMin - startMin, 30);
  return {
    block: item.block,
    lane: item.lane,
    lanes,
    topPx: pxOf(startMin),
    heightPx: Math.max(pxOf(span), 28),
  };
}

export function WeekGrid(props: WeekGridProps): JSX.Element {
  const { days, blocks } = props;
  const state = useApp();
  const { t } = useI18n();
  const timeZone = state.settings.timeZone;
  const [cursor, setCursor] = useState<Cursor>({ row: 0, col: 0 });
  const cellRefs = useRef(new Map<string, HTMLDivElement>());

  const perDay = useMemo(
    () => days.map((day) => placeDay(blocksOfDay(blocks, day), timeZone)),
    [days, blocks, timeZone],
  );

  useEffect(() => {
    cellRefs.current.get(`${cursor.row}:${cursor.col}`)?.focus();
  }, [cursor]);

  const onKeyDown = useGridKeys(cursor, days.length, perDay, setCursor);

  return (
    <div
      className="week-grid-wrap"
      role="grid"
      tabIndex={0}
      aria-label={t('a11y.weekGrid')}
      aria-colcount={days.length}
      aria-rowcount={GRID_HOURS}
      onKeyDown={onKeyDown}
    >
      <div className="week-timetable">
        <div className="week-corner" aria-hidden="true" />
        <GridHeadings days={days} />
        <HourAxis dayStart={days[0]?.start} timeZone={timeZone} />
        <div className="week-columns-body">
          {days.map((day, col) => (
            <DayColumn
              key={day.dayKey}
              day={day}
              col={col}
              placed={perDay[col] ?? []}
              cursor={cursor}
              setCursor={setCursor}
              cellRefs={cellRefs}
              timeZone={timeZone}
            />
          ))}
        </div>
      </div>
      <GridLegend />
    </div>
  );
}

/** How to read the grid: the shape of the assumed part, the hour height. */
function GridLegend(): JSX.Element {
  const { t, formatDuration } = useI18n();
  return (
    <p className="week-grid-legend">
      {t('week.assumed')}: ⋯ · {t('week.proven')}: ▮ · {t('common.time')}:{' '}
      {formatDuration(60)}
    </p>
  );
}

interface HourAxisProps {
  readonly dayStart: number | undefined;
  readonly timeZone: string;
}

/** The hour labels on the left of the columns, one per hour boundary. */
function HourAxis(props: HourAxisProps): JSX.Element {
  return (
    <div className="week-hour-axis" aria-hidden="true">
      {Array.from({ length: GRID_HOURS + 1 }, (_, hour) => (
        <span className="week-hour-tick" key={hour} style={{ top: `${hour * HOUR_PX}px` }}>
          {clockLabel(props.dayStart, hour, props.timeZone)}
        </span>
      ))}
    </div>
  );
}

function clockLabel(dayStart: number | undefined, hour: number, timeZone: string): string {
  if (dayStart === undefined) return `${String(GRID_START_HOUR + hour).padStart(2, '0')}:00`;
  return formatClockInZone(dayStart + (GRID_START_HOUR + hour) * 3_600_000, timeZone);
}

/**
 * The keyboard of the grid: the arrows move the focus, `Enter` opens the first
 * block covering the focused hour, `Escape` closes the selection.
 */
function useGridKeys(
  cursor: Cursor,
  dayCount: number,
  perDay: readonly (readonly PlacedBlock[])[],
  setCursor: (cursor: Cursor) => void,
): (event: KeyboardEvent<HTMLDivElement>) => void {
  const dispatch = useDispatch();
  const move = useCallback(
    (row: number, col: number) => {
      setCursor({
        row: Math.max(0, Math.min(GRID_HOURS - 1, row)),
        col: Math.max(0, Math.min(dayCount - 1, col)),
      });
    },
    [dayCount, setCursor],
  );
  return useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const keys: Record<string, () => void> = {
        ArrowRight: () => move(cursor.row, cursor.col + 1),
        ArrowLeft: () => move(cursor.row, cursor.col - 1),
        ArrowDown: () => move(cursor.row + 1, cursor.col),
        ArrowUp: () => move(cursor.row - 1, cursor.col),
        Home: () => move(cursor.row, 0),
        End: () => move(cursor.row, dayCount - 1),
        Enter: () => {
          const first = blockAtHour(perDay, cursor.col, cursor.row);
          if (first !== null) dispatch({ type: 'selectBlock', blockId: first.id });
        },
        Escape: () => dispatch({ type: 'selectBlock', blockId: null }),
      };
      const action = keys[event.key];
      if (action === undefined) return;
      event.preventDefault();
      action();
    },
    [cursor, dayCount, dispatch, move, perDay],
  );
}

function blockAtHour(
  perDay: readonly (readonly PlacedBlock[])[],
  col: number,
  row: number,
): Block | null {
  const top = row * HOUR_PX;
  const column = perDay[col];
  if (column === undefined) return null;
  const hit = column.find((placed) => placed.topPx < top + HOUR_PX && placed.topPx + placed.heightPx > top);
  return hit === undefined ? null : hit.block;
}

interface GridHeadingsProps {
  readonly days: readonly DayRange[];
}

const WEEKDAYS: readonly string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function weekdayName(day: DayRange, timeZone: string): string {
  const index = zonedParts(day.start, timeZone).weekday - 1;
  return WEEKDAYS[index] ?? '';
}

/** One heading per day: the long date and the weekday, once each. */
function GridHeadings(props: GridHeadingsProps): JSX.Element {
  const { formatDate } = useI18n();
  const timeZone = useApp().settings.timeZone;
  return (
    <div role="row" className="week-grid week-grid-headings">
      {props.days.map((day) => (
        <div
          key={day.dayKey}
          role="columnheader"
          className="week-day-heading"
          data-day={day.dayKey}
        >
          <span className="week-day-weekday">{weekdayName(day, timeZone)}</span>{' '}
          <span className="week-day-date">{formatDate(day.start)}</span>
        </div>
      ))}
    </div>
  );
}

interface DayColumnProps {
  readonly day: DayRange;
  readonly col: number;
  readonly placed: readonly PlacedBlock[];
  readonly cursor: Cursor;
  readonly setCursor: (cursor: Cursor) => void;
  readonly cellRefs: MutableRefObject<Map<string, HTMLDivElement>>;
  readonly timeZone: string;
}

/** One day column: the hour cells and, on top of them, the placed blocks. */
function DayColumn(props: DayColumnProps): JSX.Element {
  const state = useApp();
  return (
    <div className="week-day-column" data-day={props.day.dayKey}>
      <div className="week-day-cells">
        {Array.from({ length: GRID_HOURS }, (_, row) => (
          <HourCell
            key={row}
            day={props.day}
            col={props.col}
            row={row}
            cursor={props.cursor}
            setCursor={props.setCursor}
            cellRefs={props.cellRefs}
            timeZone={props.timeZone}
          />
        ))}
      </div>
      <div className="week-day-blocks">
        {props.placed.map((placed) => (
          <div
            key={placed.block.id}
            className="week-lane"
            style={{
              top: `${placed.topPx}px`,
              height: `${placed.heightPx}px`,
              left: `${(placed.lane / placed.lanes) * 100}%`,
              width: `${100 / placed.lanes}%`,
            }}
            data-lane={placed.lane}
            data-lanes={placed.lanes}
          >
            <BlockCard
              block={placed.block}
              evidence={evidenceOfBlock(state, placed.block.id)}
              selected={state.selectedBlockId === placed.block.id}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface HourCellProps {
  readonly day: DayRange;
  readonly col: number;
  readonly row: number;
  readonly cursor: Cursor;
  readonly setCursor: (cursor: Cursor) => void;
  readonly cellRefs: MutableRefObject<Map<string, HTMLDivElement>>;
  readonly timeZone: string;
}

function HourCell(props: HourCellProps): JSX.Element {
  const key = `${props.row}:${props.col}`;
  const focused = props.cursor.row === props.row && props.cursor.col === props.col;
  const clock = formatClockInZone(
    props.day.start + (GRID_START_HOUR + props.row) * 3_600_000,
    props.timeZone,
  );
  return (
    <div
      role="gridcell"
      className="week-cell"
      aria-colindex={props.col + 1}
      aria-rowindex={props.row + 1}
      tabIndex={focused ? 0 : -1}
      ref={(node) => {
        if (node === null) props.cellRefs.current.delete(key);
        else props.cellRefs.current.set(key, node);
      }}
      onFocus={() => props.setCursor({ row: props.row, col: props.col })}
      aria-label={`${clock} · ${props.day.dayKey}`}
    >
      <span className="visually-hidden">{clock}</span>
    </div>
  );
}
