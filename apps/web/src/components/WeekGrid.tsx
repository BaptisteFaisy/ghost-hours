import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MutableRefObject } from 'react';
import type { Block, DayRange } from '@ghost-hours/core';
import { useApp, useDispatch } from '../state/store.tsx';
import { evidenceOfBlock } from '../state/selectors.ts';
import { useI18n } from '../i18n/index.ts';
import { BlockCard } from './BlockCard.tsx';
import { SLOTS_PER_DAY, SLOT_MINUTES, assignLanes, blocksBySlot, slotClock } from './weekLayout.ts';

/**
 * The week grid (D.11): `role="grid"`, one column per day, one row per half
 * hour. Blocks are placed from their own bounds — always through the zone-aware
 * core helpers, never through local `Date` arithmetic.
 *
 * Two blocks of the same slot never cover each other: the blocks of a slot
 * are stacked in the cell (they are block-level, so they flow one under the
 * other) and each one carries the lane it was given, so the reader can see
 * that they run in parallel.
 *
 * Keyboard: the arrows move the focus from cell to cell, `Enter` opens the
 * block of the focused cell, `Escape` closes the selection.
 */

export interface WeekGridProps {
  readonly days: readonly DayRange[];
  readonly blocks: readonly Block[];
}

interface Cursor {
  readonly row: number;
  readonly col: number;
}

type CellMap = ReadonlyMap<number, readonly { block: Block; lane: number }[]>;

function blocksOfDay(dayBlocks: readonly Block[], day: DayRange): readonly Block[] {
  return dayBlocks.filter((block) => block.start >= day.start && block.start < day.end);
}

export function WeekGrid(props: WeekGridProps): JSX.Element {
  const { days, blocks } = props;
  const state = useApp();
  const { t } = useI18n();
  const timeZone = state.settings.timeZone;
  const [cursor, setCursor] = useState<Cursor>({ row: 0, col: 0 });
  const cellRefs = useRef(new Map<string, HTMLDivElement>());

  const perDay = useMemo<readonly CellMap[]>(
    () => days.map((day) => blocksBySlot(blocksOfDay(blocks, day), timeZone)),
    [days, blocks, timeZone],
  );
  const laneCount = useMemo(
    () =>
      Math.max(
        1,
        ...days.map((day) =>
          Math.max(1, ...assignLanes(blocksOfDay(blocks, day), timeZone).map((laid) => laid.lane + 1)),
        ),
      ),
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
      aria-rowcount={SLOTS_PER_DAY}
      onKeyDown={onKeyDown}
    >
      <GridHeadings days={days} />
      <GridRows
        days={days}
        cells={perDay}
        laneCount={laneCount}
        cursor={cursor}
        setCursor={setCursor}
        cellRefs={cellRefs}
        timeZone={timeZone}
      />
      <GridLegend />
    </div>
  );
}

/** How to read the grid: the shape of the assumed part, the row height. */
function GridLegend(): JSX.Element {
  const { t, formatDuration } = useI18n();
  return (
    <p className="week-grid-legend">
      {t('week.assumed')}: ⋯ · {t('week.proven')}: ▮ · {t('common.time')}:{' '}
      {formatDuration(SLOT_MINUTES)}
    </p>
  );
}

/**
 * The keyboard of the grid: the arrows move the focus, `Enter` opens the
 * block of the focused cell, `Escape` closes the selection.
 */
function useGridKeys(
  cursor: Cursor,
  dayCount: number,
  perDay: readonly CellMap[],
  setCursor: (cursor: Cursor) => void,
): (event: KeyboardEvent<HTMLDivElement>) => void {
  const dispatch = useDispatch();
  const move = useCallback(
    (row: number, col: number) => {
      setCursor({
        row: Math.max(0, Math.min(SLOTS_PER_DAY - 1, row)),
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
          const first = cellOf(perDay, cursor.col, cursor.row)[0]?.block;
          if (first !== undefined) dispatch({ type: 'selectBlock', blockId: first.id });
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

interface GridRowsProps {
  readonly days: readonly DayRange[];
  readonly cells: readonly CellMap[];
  readonly laneCount: number;
  readonly cursor: Cursor;
  readonly setCursor: (cursor: Cursor) => void;
  readonly cellRefs: MutableRefObject<Map<string, HTMLDivElement>>;
  readonly timeZone: string;
}

/** The forty-eight half-hour rows of the week. */
function GridRows(props: GridRowsProps): JSX.Element {
  return (
    <>
      {Array.from({ length: SLOTS_PER_DAY }, (_, row) => (
        <GridRow
          key={row}
          row={row}
          days={props.days}
          cells={props.cells}
          laneCount={props.laneCount}
          cursor={props.cursor}
          setCursor={props.setCursor}
          cellRefs={props.cellRefs}
          timeZone={props.timeZone}
        />
      ))}
    </>
  );
}

interface GridHeadingsProps {
  readonly days: readonly DayRange[];
}

function GridHeadings(props: GridHeadingsProps): JSX.Element {
  const { formatDate } = useI18n();
  return (
    <div role="row" className="week-grid week-grid-headings">
      {props.days.map((day) => (
        <div
          key={day.dayKey}
          role="columnheader"
          className="week-day-heading"
          data-day={day.dayKey}
        >
          {formatDate(day.start)} · {day.dayKey}
        </div>
      ))}
    </div>
  );
}

interface GridRowProps {
  readonly row: number;
  readonly days: readonly DayRange[];
  readonly cells: readonly CellMap[];
  readonly laneCount: number;
  readonly cursor: Cursor;
  readonly setCursor: (cursor: Cursor) => void;
  readonly cellRefs: MutableRefObject<Map<string, HTMLDivElement>>;
  readonly timeZone: string;
}

function cellOf(cells: readonly CellMap[], col: number, row: number): readonly { block: Block; lane: number }[] {
  const map = cells[col];
  if (map === undefined) return [];
  const list = map.get(row);
  return list === undefined ? [] : list;
}

function GridRow(props: GridRowProps): JSX.Element {
  return (
    <div role="row" className="week-grid week-grid-row" aria-rowindex={props.row + 1}>
      {props.days.map((day, col) => (
        <GridCell
          key={day.dayKey}
          day={day}
          col={col}
          row={props.row}
          cell={cellOf(props.cells, col, props.row)}
          laneCount={props.laneCount}
          cursor={props.cursor}
          setCursor={props.setCursor}
          cellRefs={props.cellRefs}
          timeZone={props.timeZone}
        />
      ))}
    </div>
  );
}

interface GridCellProps {
  readonly day: DayRange;
  readonly col: number;
  readonly row: number;
  readonly cell: readonly { block: Block; lane: number }[];
  readonly laneCount: number;
  readonly cursor: Cursor;
  readonly setCursor: (cursor: Cursor) => void;
  readonly cellRefs: MutableRefObject<Map<string, HTMLDivElement>>;
  readonly timeZone: string;
}

function GridCell(props: GridCellProps): JSX.Element {
  const state = useApp();
  const { t } = useI18n();
  const key = `${props.row}:${props.col}`;
  const focused = props.cursor.row === props.row && props.cursor.col === props.col;
  return (
    <div
      role="gridcell"
      className="week-cell"
      aria-colindex={props.col + 1}
      tabIndex={focused ? 0 : -1}
      ref={(node) => {
        if (node === null) props.cellRefs.current.delete(key);
        else props.cellRefs.current.set(key, node);
      }}
      onFocus={() => props.setCursor({ row: props.row, col: props.col })}
      aria-label={`${slotClock(props.day.start, props.row, props.timeZone)} · ${props.day.dayKey}`}
    >
      <span className="visually-hidden">{slotClock(props.day.start, props.row, props.timeZone)}</span>
      {props.cell.map((laid) => (
        <div
          key={laid.block.id}
          className="week-lane"
          data-lane={laid.lane}
          data-lanes={props.laneCount}
        >
          <BlockCard
            block={laid.block}
            evidence={evidenceOfBlock(state, laid.block.id)}
            selected={state.selectedBlockId === laid.block.id}
          />
        </div>
      ))}
      {props.cell.length === 0 && <span className="visually-hidden">{t('week.noBlocks')}</span>}
    </div>
  );
}
