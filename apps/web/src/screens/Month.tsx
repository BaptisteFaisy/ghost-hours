import { useMemo, useState } from 'react';
import type { Cents, Minutes } from '@ghost-hours/core';
import { dayKeyInZone, monthRangeInZone } from '@ghost-hours/core';
import { useApp, useDispatch } from '../state/store.tsx';
import { clientById, monthCounter } from '../state/selectors.ts';
import type { AppState } from '../state/types.ts';
import { useI18n } from '../i18n/index.ts';
import { formatHoursShort } from '../components/format.ts';
import { GapExplainer } from '../components/GapExplainer.tsx';

/**
 * The month screen (D.11): the ghost-hours counter, the load of each day and
 * the breakdown per client.
 *
 * The counter is the headline of the whole app: how many hours were found, how
 * many the user confirmed, how many she declared, and what the difference is
 * worth. It lives in an `aria-live="polite"` region so a screen reader
 * announces the new figures as soon as the declared hours change.
 */

export function Month(): JSX.Element {
  const state = useApp();
  const dispatch = useDispatch();
  const { t } = useI18n();
  const timeZone = state.settings.timeZone;
  // `null` reads "every client". The filter narrows the breakdowns below; the
  // counter stays global on purpose — it is the headline of the month, and a
  // headline that quietly changes meaning when a filter moves is a trap.
  const [clientFilter, setClientFilter] = useState<string | null>(null);

  const rows = monthCounter(state);
  const perClient = rows.filter(
    (row) => row.clientId !== null && clientById(state, row.clientId) !== null,
  );
  const shown = clientFilter === null ? perClient : perClient.filter((row) => row.clientId === clientFilter);
  const all = rows.find((row) => row.clientId === null) ?? null;

  const dayLoad = useMemo(
    () => loadPerDay(state.blocks, state.activeMonth.year, state.activeMonth.month, timeZone, clientFilter),
    [state.blocks, state.activeMonth, timeZone, clientFilter],
  );

  const found = all?.foundMinutes ?? sum(perClient.map((row) => row.foundMinutes));
  const confirmed = all?.confirmedMinutes ?? sum(perClient.map((row) => row.confirmedMinutes));
  const declared = all?.declaredMinutes ?? null;
  const ghost = all?.ghostMinutes ?? (declared === null ? null : found - declared);
  const amount = all?.ghostAmountCents ?? null;

  return (
    <section className="card month-screen" aria-label={t('month.title')}>
      <h2>{t('month.title')}</h2>
      <MonthNav />
      <Counter
        found={found}
        confirmed={confirmed}
        declared={declared}
        ghost={ghost}
        amount={amount}
      />
      <GapExplainer />
      <ConfirmSolid />
      <ClientFilter value={clientFilter} onChange={setClientFilter} />
      <h3>{t('month.perDay')}</h3>
      <DayLoadBars dayLoad={dayLoad} />
      <h3>{t('month.perClient')}</h3>
      <ClientBreakdown
        rows={shown}
        declared={state.declaredMinutes}
        onDeclare={(clientId, minutes) => dispatch({ type: 'setDeclared', clientId, minutes })}
      />
    </section>
  );
}

/** Two digits, as `input[type=month]` wants them ("2026-11", not "2026-1"). */
function monthValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Which month is under review is a choice, not a given: the previous and next
 * month, the current one, and a picker. Everything dispatches `setActiveMonth`,
 * so the counter, the load per day, the week and the invoice follow.
 */
function MonthNav(): JSX.Element {
  const { t } = useI18n();
  const state = useApp();
  const dispatch = useDispatch();
  const { year, month } = state.activeMonth;
  const shift = (delta: number): void => {
    const moved = new Date(Date.UTC(year, month - 1 + delta, 1));
    dispatch({
      type: 'setActiveMonth',
      year: moved.getUTCFullYear(),
      month: moved.getUTCMonth() + 1,
    });
  };
  return (
    <nav className="month-nav" aria-label={t('month.selectMonth')}>
      <button type="button" onClick={() => shift(-1)}>
        {t('common.previous')}
      </button>{' '}
      <label htmlFor="month-picker">{t('month.selectMonth')}</label>{' '}
      <input
        id="month-picker"
        type="month"
        value={monthValue(year, month)}
        onChange={(event) => {
          const [picked, pickedMonth] = event.target.value.split('-');
          if (picked === undefined || pickedMonth === undefined) return;
          dispatch({
            type: 'setActiveMonth',
            year: Number(picked),
            month: Number(pickedMonth),
          });
        }}
      />{' '}
      <button type="button" onClick={() => shift(1)}>
        {t('common.next')}
      </button>{' '}
      <TodayButton />
    </nav>
  );
}

/** Back to the month the reader is living in, in the zone the data is read in. */
function TodayButton(): JSX.Element {
  const { t } = useI18n();
  const state = useApp();
  const dispatch = useDispatch();
  return (
    <button
      type="button"
      onClick={() => {
        const key = dayKeyInZone(Date.now(), state.settings.timeZone);
        dispatch({
          type: 'setActiveMonth',
          year: Number(key.slice(0, 4)),
          month: Number(key.slice(5, 7)),
        });
      }}
    >
      {t('common.today')}
    </button>
  );
}

/** Narrows the two breakdowns below to one client, or to all of them. */
function ClientFilter(props: {
  value: string | null;
  onChange: (value: string | null) => void;
}): JSX.Element {
  const { t } = useI18n();
  const state = useApp();
  return (
    <label className="month-client-filter" htmlFor="month-client-filter">
      {t('common.client')}{' '}
      <select
        id="month-client-filter"
        value={props.value ?? ''}
        onChange={(event) => props.onChange(event.target.value === '' ? null : event.target.value)}
      >
        <option value="">{t('month.allClients')}</option>
        {state.clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
    </label>
  );
}

const SOLID_THRESHOLD = 0.8;

/** Blocks the one gesture can confirm: proposed, in the active month, proven enough. */
function proposedSolidCount(state: AppState): number {
  const prefix = `${state.activeMonth.year}-${String(state.activeMonth.month).padStart(2, '0')}`;
  return state.blocks.filter(
    (block) =>
      block.status === 'proposed' &&
      block.provenShare >= SOLID_THRESHOLD &&
      dayKeyInZone(block.start, state.settings.timeZone).startsWith(prefix),
  ).length;
}

type SolidNotice = { readonly kind: 'done'; readonly count: number } | { readonly kind: 'none' };

/**
 * One gesture for the easy cases (idea U-17): confirm every proposed block of
 * the active month whose proven share reaches the threshold, and leave the
 * rest for the review.
 */
function ConfirmSolid(): JSX.Element {
  const state = useApp();
  const dispatch = useDispatch();
  const { t } = useI18n();
  const [notice, setNotice] = useState<SolidNotice | null>(null);
  const hintId = 'confirm-solid-hint';

  const confirm = (): void => {
    const count = proposedSolidCount(state);
    dispatch({ type: 'confirmSolidBlocks', threshold: SOLID_THRESHOLD });
    setNotice(count > 0 ? { kind: 'done', count } : { kind: 'none' });
  };

  return (
    <p>
      <button type="button" className="button" aria-describedby={hintId} onClick={confirm}>
        {t('week.confirmSolid')}
      </button>{' '}
      <span id={hintId} className="visually-hidden">
        {t('week.confirmSolidHint', { threshold: Math.round(SOLID_THRESHOLD * 100) })}
      </span>
      <span aria-live="polite">
        {notice === null
          ? ''
          : notice.kind === 'done'
            ? t('week.confirmSolidDone', { count: notice.count })
            : t('week.confirmSolidNone')}
      </span>
    </p>
  );
}

interface CounterProps {
  readonly found: Minutes;
  readonly confirmed: Minutes;
  readonly declared: Minutes | null;
  readonly ghost: Minutes | null;
  readonly amount: Cents | null;
}

function Counter(props: CounterProps): JSX.Element {
  const { t, locale, formatMoney } = useI18n();
  return (
    <>
      <dl className="counter" aria-live="polite" aria-label={t('a11y.monthCounter')}>
        <div className="counter-item">
          <dt>{t('month.foundHours')}</dt>
          <dd>{formatHoursShort(props.found, locale)}</dd>
        </div>
        <div className="counter-item">
          <dt>{t('month.confirmedHours')}</dt>
          <dd>{formatHoursShort(props.confirmed, locale)}</dd>
        </div>
        <div className="counter-item">
          <dt>{t('month.declaredHours')}</dt>
          <dd>
            {props.declared === null ? t('month.noDeclared') : formatHoursShort(props.declared, locale)}
          </dd>
        </div>
        <div className="counter-item" data-tone="ghost">
          <dt>{t('month.ghostHours')}</dt>
          <dd>{props.ghost === null ? '—' : formatHoursShort(props.ghost, locale)}</dd>
        </div>
        <div className="counter-item" data-tone="ghost">
          <dt>{t('month.ghostAmount')}</dt>
          <dd>{props.amount === null ? '—' : formatMoney(props.amount)}</dd>
        </div>
      </dl>
      <p className="month-summary">
        {t('month.counterSummary', {
          found: formatHoursShort(props.found, locale),
          confirmed: formatHoursShort(props.confirmed, locale),
          ghost: props.ghost === null ? '—' : formatHoursShort(props.ghost, locale),
          amount: props.amount === null ? '—' : formatMoney(props.amount),
        })}
      </p>
    </>
  );
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

interface DayLoadEntry {
  readonly dayKey: string;
  readonly minutes: Minutes;
}

function loadPerDay(
  blocks: AppState['blocks'],
  year: number,
  month: number,
  timeZone: string,
  clientId: string | null,
): readonly DayLoadEntry[] {
  const range = monthRangeInZone(year, month, timeZone);
  const byDay = new Map<string, Minutes>();
  for (const block of blocks) {
    if (block.start < range.start || block.start >= range.end) continue;
    if (clientId !== null && block.clientId !== clientId) continue;
    const key = dayKeyInZone(block.start, timeZone);
    const minutes = Math.max(0, Math.round((block.end - block.start) / 60_000));
    byDay.set(key, (byDay.get(key) ?? 0) + minutes);
  }
  return [...byDay.entries()]
    .map(([dayKey, minutes]) => ({ dayKey, minutes }))
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

interface DayLoadBarsProps {
  readonly dayLoad: readonly DayLoadEntry[];
}

/** Height of the bar container, in pixels: the busiest day fills it. */
const DAY_LOAD_MAX_PX = 160;

function barHeightPx(minutes: Minutes, max: Minutes): number {
  return Math.max(2, Math.round((minutes / max) * DAY_LOAD_MAX_PX));
}

/** `2026-11-02` → `02`: the short day label under each bar. */
function shortDayLabel(dayKey: string): string {
  return dayKey.slice(8);
}

function DayLoadBars(props: DayLoadBarsProps): JSX.Element {
  const { t, formatDuration, formatDay } = useI18n();
  const max = Math.max(1, ...props.dayLoad.map((entry) => entry.minutes));
  if (props.dayLoad.length === 0) return <p>{t('week.noBlocks')}</p>;
  return (
    <>
      <div className="day-load" role="group" aria-label={t('month.perDay')}>
        {props.dayLoad.map((entry) => (
          <div className="day-load-column" key={entry.dayKey}>
            <div className="day-load-bar-area">
              <div
                className="day-load-bar"
                style={{ height: `${barHeightPx(entry.minutes, max)}px` }}
                title={`${formatDay(entry.dayKey)}: ${formatDuration(entry.minutes)}`}
                role="img"
                aria-label={`${formatDay(entry.dayKey)}: ${formatDuration(entry.minutes)}`}
              />
            </div>
            <span className="day-load-label" aria-hidden="true">
              {shortDayLabel(entry.dayKey)}
            </span>
          </div>
        ))}
      </div>
      <ul className="day-load-text">
        {props.dayLoad.map((entry) => (
          <li key={entry.dayKey}>
            {formatDay(entry.dayKey)}: {formatDuration(entry.minutes)}
          </li>
        ))}
      </ul>
    </>
  );
}

interface ClientBreakdownProps {
  readonly rows: ReturnType<typeof monthCounter>;
  readonly declared: Readonly<Record<string, number | null>>;
  readonly onDeclare: (clientId: string, minutes: Minutes | null) => void;
}

function ClientBreakdown(props: ClientBreakdownProps): JSX.Element {
  const state = useApp();
  const { t } = useI18n();
  return (
    <table className="month-clients">
      <thead>
        <tr>
          <th scope="col">{t('common.client')}</th>
          <th scope="col">{t('month.foundHours')}</th>
          <th scope="col">{t('month.confirmedHours')}</th>
          <th scope="col">{t('month.declaredHours')}</th>
          <th scope="col">{t('month.ghostHours')}</th>
          <th scope="col">{t('month.ghostAmount')}</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <ClientRow
            key={row.clientId ?? ''}
            row={row}
            declared={props.declared[row.clientId ?? ''] ?? null}
            clientName={clientById(state, row.clientId ?? '')?.name ?? t('common.unknown')}
            onDeclare={props.onDeclare}
          />
        ))}
      </tbody>
    </table>
  );
}

interface ClientRowProps {
  readonly row: ReturnType<typeof monthCounter>[number];
  readonly declared: Minutes | null;
  readonly clientName: string;
  readonly onDeclare: (clientId: string, minutes: Minutes | null) => void;
}

function ClientRow(props: ClientRowProps): JSX.Element {
  const { t, locale, formatMoney } = useI18n();
  const clientId = props.row.clientId ?? '';
  return (
    <tr>
      <th scope="row">{props.clientName}</th>
      <td className="numeric">{formatHoursShort(props.row.foundMinutes, locale)}</td>
      <td className="numeric">{formatHoursShort(props.row.confirmedMinutes, locale)}</td>
      <td className="numeric">
        <label>
          <span className="visually-hidden">
            {t('month.declaredPlaceholder')} — {props.clientName}
          </span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={props.declared === null ? '' : props.declared / 60}
            placeholder={t('month.declaredPlaceholder')}
            aria-label={`${t('month.declaredPlaceholder')} — ${props.clientName}`}
            onChange={(event) => {
              const raw = event.target.value;
              const hours = raw === '' ? null : Number(raw);
              props.onDeclare(
                clientId,
                hours === null || Number.isNaN(hours) ? null : Math.round(hours * 60),
              );
            }}
          />
        </label>
      </td>
      <td className="numeric">
        {props.row.ghostMinutes === null ? '—' : formatHoursShort(props.row.ghostMinutes, locale)}
      </td>
      <td className="numeric">
        {props.row.ghostAmountCents === null ? '—' : formatMoney(props.row.ghostAmountCents)}
      </td>
    </tr>
  );
}
