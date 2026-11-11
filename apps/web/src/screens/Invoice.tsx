import { useI18n } from '../i18n/index.ts';
import { useApp, useDispatch } from '../state/store.tsx';
import { annexFor, draftFor } from '../state/selectors.ts';
import { monthRangeInZone } from '@ghost-hours/core';
import type { AnnexDay, InvoiceDraft } from '@ghost-hours/core';

/**
 * The invoice screen (D.11): the draft, its annex and the invoice action.
 *
 * The draft carries no invoice number: it is a draft, and it says so on its
 * face (`draftLabel`).
 */
export function Invoice(): JSX.Element {
  const { t, formatDate } = useI18n();
  const state = useApp();
  const dispatch = useDispatch();
  const client = state.clients[0];
  const period = monthRangeInZone(
    state.activeMonth.year,
    state.activeMonth.month,
    state.settings.timeZone,
  );

  if (client === undefined) {
    return (
      <section className="card" aria-label={t('invoice.title')}>
        <h2>{t('invoice.title')}</h2>
        <p>{t('invoice.noLines')}</p>
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
      <p>{`${t('invoice.period')}: ${formatDate(period.start)}`}</p>
      <DraftLines draft={draft} />
      <Totals draft={draft} />
      <Annex annex={annex} />
      <button
        type="button"
        onClick={() =>
          dispatch({
            type: 'markPeriodInvoiced',
            clientId: client.id,
            start: period.start,
            end: period.end,
          })
        }
      >
        {t('invoice.markInvoiced')}
      </button>
    </section>
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
    <>
      <p>{`${t('invoice.subtotal')}: ${formatMoney(draft.subtotalCents, draft.currency)}`}</p>
      <p>{`${t('invoice.tax')}: ${formatMoney(draft.taxCents, draft.currency)}`}</p>
      <p>{`${t('invoice.grandTotal')}: ${formatMoney(draft.totalCents, draft.currency)}`}</p>
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
