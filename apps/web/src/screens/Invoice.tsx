import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.ts';
import { useApp, useDispatch } from '../state/store.tsx';
import { annexFor, draftFor } from '../state/selectors.ts';
import { monthRangeInZone } from '@ghost-hours/core';
import type { AnnexDay, InvoiceDraft } from '@ghost-hours/core';
import { annexToCsv, billableBlocks, clipToPeriod, draftToJson, draftToPrintHtml, timesheetCsv } from '@ghost-hours/billing';
import { downloadText, openPrintWindow } from '../lib/download.ts';

/**
 * The invoice screen (D.11): the draft, its annex, its exports.
 *
 * The draft carries no invoice number: it is a draft, and it says so on its
 * face (`draftLabel`). Only confirmed and locked blocks reach it — the rest of
 * the work is proposed, and proposed work is not billed.
 */
export function Invoice(): JSX.Element {
  const { t } = useI18n();
  const state = useApp();
  const [clientId, setClientId] = useState<string>(state.clients[0]?.id ?? '');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!state.clients.some((client) => client.id === clientId)) {
      setClientId(state.clients[0]?.id ?? '');
    }
  }, [clientId, state.clients]);

  const client = state.clients.find((item) => item.id === clientId);

  if (client === undefined) {
    return (
      <section className="card" aria-label={t('invoice.title')}>
        <h2>{t('invoice.title')}</h2>
        <p>{t('invoice.noClient')}</p>
      </section>
    );
  }

  const draft = draftFor(state, client.id);
  const annex = annexFor(state, client.id);

  return (
    <section className="card" aria-label={t('invoice.title')}>
      <h2>{t('invoice.title')}</h2>
      <p className="invoice-draft-label">{t('invoice.draft')}</p>
      <p>{t('invoice.draftNotice')}</p>
      <ClientPicker clientId={client.id} onPick={setClientId} />
      <PeriodNav />
      <DraftLines draft={draft} />
      <Totals draft={draft} />
      <TaxAndNotes />
      <ExportBar draft={draft} annex={annex} />
      <Annex annex={annex} />
      <MarkInvoiced
        clientId={client.id}
        confirming={confirming}
        onAsk={() => setConfirming(true)}
        onDone={() => setConfirming(false)}
      />
    </section>
  );
}

function ClientPicker(props: { clientId: string; onPick: (clientId: string) => void }): JSX.Element {
  const { t } = useI18n();
  const state = useApp();
  return (
    <p>
      <label htmlFor="invoice-client">{t('common.client')}</label>{' '}
      <select
        id="invoice-client"
        value={props.clientId}
        onChange={(event) => props.onPick(event.target.value)}
      >
        {state.clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
    </p>
  );
}

function PeriodNav(): JSX.Element {
  const { t, formatDate } = useI18n();
  const state = useApp();
  const dispatch = useDispatch();
  const period = monthRangeInZone(state.activeMonth.year, state.activeMonth.month, state.settings.timeZone);
  const move = (delta: number): void => {
    const zeroBased = state.activeMonth.month - 1 + delta;
    const year = state.activeMonth.year + Math.floor(zeroBased / 12);
    const month = ((zeroBased % 12) + 12) % 12 + 1;
    dispatch({ type: 'setActiveMonth', year, month });
  };
  return (
    <p>
      <button type="button" onClick={() => move(-1)}>
        {t('invoice.previousPeriod')}
      </button>{' '}
      <span>{`${t('invoice.period')}: ${formatDate(period.start)}`}</span>{' '}
      <button type="button" onClick={() => move(1)}>
        {t('invoice.nextPeriod')}
      </button>
    </p>
  );
}

function DraftLines(props: { draft: InvoiceDraft }): JSX.Element {
  const { t, formatMoney, formatDuration } = useI18n();
  const { draft } = props;
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">{t('invoice.line')}</th>
          <th scope="col" className="numeric">
            {t('invoice.quantity')}
          </th>
          <th scope="col" className="numeric">
            {t('invoice.unitPrice')}
          </th>
          <th scope="col" className="numeric">
            {t('common.amount')}
          </th>
        </tr>
      </thead>
      <tbody>
        {draft.lines.map((line) => (
          <tr key={line.projectId ?? line.label}>
            <th scope="row">{line.label}</th>
            <td className="numeric">{formatDuration(line.quantityMinutes)}</td>
            <td className="numeric">{formatMoney(line.unitPriceCents, draft.currency)}</td>
            <td className="numeric">{formatMoney(line.amountCents, draft.currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Totals(props: { draft: InvoiceDraft }): JSX.Element {
  const { t, formatMoney } = useI18n();
  const { draft } = props;
  return (
    <div aria-live="polite">
      <p>{`${t('invoice.subtotal')}: ${formatMoney(draft.subtotalCents, draft.currency)}`}</p>
      <p>{`${t('invoice.tax')}: ${formatMoney(draft.taxCents, draft.currency)}`}</p>
      <p>{`${t('invoice.grandTotal')}: ${formatMoney(draft.totalCents, draft.currency)}`}</p>
      <p>{`${t('invoice.roundingNote')}: ${draft.roundingNote}`}</p>
    </div>
  );
}

function TaxAndNotes(): JSX.Element {
  const { t } = useI18n();
  const state = useApp();
  const dispatch = useDispatch();
  return (
    <>
      <p>
        <label htmlFor="invoice-tax">{t('invoice.taxRate')}</label>{' '}
        <input
          id="invoice-tax"
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={state.taxRateBp / 100}
          onChange={(event) =>
            dispatch({ type: 'setTaxRate', basisPoints: Math.round(Number(event.target.value) * 100) })
          }
        />{' '}
        %
      </p>
      <p>
        <label htmlFor="invoice-notes">{t('invoice.notes')}</label>
        <textarea
          id="invoice-notes"
          rows={2}
          placeholder={t('invoice.notesPlaceholder')}
          value={state.freeTextNotes.join('\n')}
          onChange={(event) =>
            dispatch({
              type: 'setNotes',
              notes: event.target.value.split('\n').filter((line) => line.trim().length > 0),
            })
          }
        />
      </p>
    </>
  );
}

function ExportBar(props: { draft: InvoiceDraft; annex: readonly AnnexDay[] }): JSX.Element {
  const { t } = useI18n();
  return (
    <section aria-label={t('invoice.exportCsv')}>
      <p>{t('invoice.exportHint')}</p>
      <ExportButtons draft={props.draft} annex={props.annex} />
      <AnnexDetailPicker />
    </section>
  );
}

function ExportButtons(props: { draft: InvoiceDraft; annex: readonly AnnexDay[] }): JSX.Element {
  const { t } = useI18n();
  const state = useApp();
  const { draft, annex } = props;
  const period = monthRangeInZone(state.activeMonth.year, state.activeMonth.month, state.settings.timeZone);
  const billable = clipToPeriod(billableBlocks(state.blocks), period).filter(
    (block) => block.clientId === draft.clientId,
  );
  const csv = timesheetCsv(billable, state.clients, state.settings, state.locale);
  const annexCsv = annexToCsv(annex, state.locale);
  const printable = draftToPrintHtml(draft, annex, state.locale, state.settings.timeZone);
  return (
    <>
      <button type="button" onClick={() => downloadText(`timesheet-${draft.clientName}.csv`, csv, 'text/csv;charset=utf-8')}>
        {t('invoice.exportCsv')}
      </button>{' '}
      <button type="button" onClick={() => downloadText(`draft-${draft.clientName}.json`, draftToJson(draft), 'application/json')}>
        {t('invoice.exportJson')}
      </button>{' '}
      <button type="button" onClick={() => openPrintWindow(printable)}>
        {t('invoice.print')}
      </button>{' '}
      <button type="button" onClick={() => downloadText(`annex-${draft.clientName}.csv`, annexCsv, 'text/csv;charset=utf-8')}>
        {t('invoice.annex')}
      </button>
    </>
  );
}

function AnnexDetailPicker(): JSX.Element {
  const { t } = useI18n();
  const state = useApp();
  const dispatch = useDispatch();
  return (
    <>
      <label htmlFor="annex-detail">{t('invoice.annexDetail')}</label>{' '}
      <select
        id="annex-detail"
        value={state.annexDetail}
        onChange={(event) =>
          dispatch({
            type: 'setAnnexDetail',
            detail: event.target.value === 'with-evidence' ? 'with-evidence' : 'durations',
          })
        }
      >
        <option value="durations">{t('invoice.annexDurations')}</option>
        <option value="with-evidence">{t('invoice.annexWithEvidence')}</option>
      </select>
    </>
  );
}

function Annex(props: { annex: readonly AnnexDay[] }): JSX.Element {
  const { t, formatDuration, formatDay } = useI18n();
  return (
    <section aria-label={t('invoice.annex')}>
      <h3>{t('invoice.annex')}</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">{t('common.day')}</th>
            <th scope="col" className="numeric">
              {t('common.duration')}
            </th>
          </tr>
        </thead>
        <tbody>
          {props.annex.map((day) => (
            <tr key={day.dayKey}>
              <th scope="row">{formatDay(day.dayKey)}</th>
              <td className="numeric">{formatDuration(day.minutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * Marking a period invoiced locks its blocks (HEU-F-29), so it asks twice:
 * the first click shows what will happen, the second does it.
 */
function MarkInvoiced(props: {
  clientId: string;
  confirming: boolean;
  onAsk: () => void;
  onDone: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const state = useApp();
  const dispatch = useDispatch();
  const period = monthRangeInZone(state.activeMonth.year, state.activeMonth.month, state.settings.timeZone);
  if (!props.confirming) {
    return (
      <button type="button" onClick={props.onAsk}>
        {t('invoice.markInvoiced')}
      </button>
    );
  }
  return (
    <p aria-live="polite">
      <span>{t('invoice.markInvoicedExplain')}</span>{' '}
      <button
        type="button"
        onClick={() => {
          dispatch({
            type: 'markPeriodInvoiced',
            clientId: props.clientId,
            start: period.start,
            end: period.end,
          });
          props.onDone();
        }}
      >
        {t('common.save')}
      </button>{' '}
      <button type="button" onClick={props.onDone}>
        {t('common.cancel')}
      </button>
    </p>
  );
}
