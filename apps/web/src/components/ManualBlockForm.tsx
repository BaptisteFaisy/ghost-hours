import { useState } from 'react';
import type { Instant } from '@ghost-hours/core';
import { formatMinutes, parseClock, zonedTimeToInstant } from '@ghost-hours/core';
import { useApp, useDispatch } from '../state/store.tsx';
import { useI18n } from '../i18n/index.ts';

/**
 * Declaring a block by hand (HEU-F-05).
 *
 * What the evidence does not show still happened: a phone call, a workshop, a
 * day without a commit. The block is created as declared work — the sessionizer
 * grades it `to-confirm` with a proven share of zero, so it never looks like
 * proof, and it only reaches an invoice once confirmed like any other block.
 */
export interface ManualBlockFormProps {
  /** Day shown in the date field when the form opens. */
  readonly dayKey: string;
  readonly onDone: () => void;
}

export function ManualBlockForm(props: ManualBlockFormProps): JSX.Element {
  const { t } = useI18n();
  const state = useApp();
  const dispatch = useDispatch();
  const [day, setDay] = useState(props.dayKey);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [clientId, setClientId] = useState(state.clients[0]?.id ?? '');
  const [added, setAdded] = useState<string | null>(null);

  const bounds = toInstants(day, start, end, state.settings.timeZone);
  const valid = bounds !== null && clientId !== '';

  function submit(): void {
    if (bounds === null || clientId === '') return;
    dispatch({ type: 'addManualBlock', start: bounds.start, end: bounds.end, clientId });
    setAdded(t('manual.added', { duration: formatMinutes((bounds.end - bounds.start) / 60_000) }));
  }

  return (
    <section className="card" aria-label={t('manual.title')}>
      <h3>{t('manual.title')}</h3>
      <p>{t('manual.hint')}</p>
      <Field id="manual-day" label={t('manual.date')}>
        <input id="manual-day" type="date" value={day} onChange={(event) => setDay(event.target.value)} />
      </Field>
      <Field id="manual-start" label={t('manual.start')}>
        <input id="manual-start" type="time" value={start} onChange={(event) => setStart(event.target.value)} />
      </Field>
      <Field id="manual-end" label={t('manual.end')}>
        <input id="manual-end" type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
      </Field>
      <Field id="manual-client" label={t('common.client')}>
        <select id="manual-client" value={clientId} onChange={(event) => setClientId(event.target.value)}>
          {state.clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </Field>
      {!valid && <p role="alert">{t('manual.invalid')}</p>}
      {added !== null && <p aria-live="polite">{added}</p>}
      <button type="button" disabled={!valid} onClick={submit}>
        {t('manual.add')}
      </button>{' '}
      <button type="button" onClick={props.onDone}>
        {t('common.cancel')}
      </button>
    </section>
  );
}

function Field(props: { id: string; label: string; children: JSX.Element }): JSX.Element {
  return (
    <p>
      <label htmlFor={props.id}>{props.label}</label> {props.children}
    </p>
  );
}

/** Wall clock in the settings' zone to instants; `null` when the range is invalid. */
function toInstants(day: string, start: string, end: string, timeZone: string): { start: Instant; end: Instant } | null {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const startMinutes = parseClock(start);
  const endMinutes = parseClock(end);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(date)) return null;
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return null;
  return {
    start: zonedTimeToInstant({ year, month, day: date, hour: Math.floor(startMinutes / 60), minute: startMinutes % 60 }, timeZone),
    end: zonedTimeToInstant({ year, month, day: date, hour: Math.floor(endMinutes / 60), minute: endMinutes % 60 }, timeZone),
  };
}
