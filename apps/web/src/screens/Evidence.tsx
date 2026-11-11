import type { Block, Evidence, EvidenceKind, Instant } from '@ghost-hours/core';
import { formatPercent, monthRangeInZone } from '@ghost-hours/core';
import { sortEvidence } from '@ghost-hours/mapping';
import { useApp, useDispatch } from '../state/store.tsx';
import { blockById, clientById, evidenceOfBlock } from '../state/selectors.ts';
import { useI18n } from '../i18n/index.ts';
import type { MessageKey } from '../i18n/index.ts';

/**
 * The evidence screen (D.11, HEU-F-20): the panel of the selected block.
 *
 * The panel shows the stitch — the seam that links the proofs in the order
 * they happened, one glyph per source — then each proof with the fields its
 * source carries, then the share of the block that is proven and the share
 * that is only assumed. Nothing is computed here: the blocks and the proofs
 * come from the selectors, the words come from the dictionary.
 */

const KIND_KEYS: Readonly<Record<EvidenceKind, MessageKey>> = {
  commit: 'evidence.commit',
  checkout: 'evidence.checkout',
  meeting: 'evidence.meeting',
  note: 'evidence.note',
  manual: 'evidence.manual',
};

const STATUS_KEYS: Readonly<Record<Block['status'], MessageKey>> = {
  proposed: 'status.proposed',
  confirmed: 'status.confirmed',
  rejected: 'status.rejected',
  conflict: 'status.conflict',
  locked: 'status.locked',
};

const CONFIDENCE_KEYS: Readonly<Record<Block['confidence'], MessageKey>> = {
  solid: 'status.solid',
  likely: 'status.likely',
  'to-confirm': 'status.toConfirm',
};

/** Keys the dictionaries do not carry yet — reported, never invented. */
export type ExtraPair = { readonly en: string; readonly fr: string };

const EXTRA_EVIDENCE: Readonly<Record<string, ExtraPair>> = {
  'evidence.file': { en: 'File', fr: 'Fichier' },
  'evidence.line': { en: 'Line', fr: 'Ligne' },
};

/**
 * Translate a key the dictionaries may not carry yet: `t()` first, so a key
 * added later to `i18n/en.ts` and `i18n/fr.ts` wins on its own, and the local
 * pair of strings until then. Never shows a bare key to the user.
 */
export function useText(
  fallbacks: Readonly<Record<string, ExtraPair>>,
): (key: string) => string {
  const { t, locale } = useI18n();
  return (key) => {
    const translated = t(key as MessageKey);
    if (translated !== key) return translated;
    const pair = fallbacks[key];
    if (pair === undefined) return key;
    return locale === 'fr' ? pair.fr : pair.en;
  };
}

export function Evidence(): JSX.Element {
  const state = useApp();
  const dispatch = useDispatch();
  const { t } = useI18n();
  const selected =
    state.selectedBlockId === null ? null : blockById(state, state.selectedBlockId);

  return (
    <section className="card evidence-screen" aria-label={t('evidence.title')}>
      <h2>{t('evidence.title')}</h2>
      {selected === null ? (
        <EmptyState blocks={monthBlocks(state)} onOpen={(id) => dispatch({ type: 'selectBlock', blockId: id })} />
      ) : (
        <BlockPanel
          block={selected}
          proofs={evidenceOfBlock(state, selected.id)}
          clientName={clientById(state, selected.clientId)?.name ?? t('common.unknown')}
          onBack={() => dispatch({ type: 'selectBlock', blockId: null })}
        />
      )}
    </section>
  );
}

/** The blocks of the reviewed month, in chronological order. */
function monthBlocks(state: {
  readonly blocks: readonly Block[];
  readonly activeMonth: { readonly year: number; readonly month: number };
  readonly settings: { readonly timeZone: string };
}): readonly Block[] {
  const range = monthRangeInZone(
    state.activeMonth.year,
    state.activeMonth.month,
    state.settings.timeZone,
  );
  return state.blocks
    .filter((block) => block.start < range.end && block.end > range.start)
    .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
}

interface EmptyStateProps {
  readonly blocks: readonly Block[];
  readonly onOpen: (blockId: string) => void;
}

/** No block selected: say what to do, and offer the blocks that can be opened. */
function EmptyState(props: EmptyStateProps): JSX.Element {
  const { t, formatDate, formatTime } = useI18n();
  const blocks = props.blocks;
  return (
    <div className="empty-state">
      <p>{t('evidence.empty')}</p>
      {blocks.length === 0 ? <p>{t('empty.body')}</p> : null}
      {blocks.length > 0 ? (
        <ul className="evidence-list" aria-live="polite" aria-label={t('week.openBlock')}>
          {blocks.map((block) => (
            <li key={block.id} className="evidence-item">
              <button type="button" onClick={() => props.onOpen(block.id)}>
                {t('week.openBlock')}
              </button>
              <span className="evidence-when">
                {formatDate(block.start)} {formatTime(block.start)} — {formatTime(block.end)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

interface BlockPanelProps {
  readonly block: Block;
  readonly proofs: readonly Evidence[];
  readonly clientName: string;
  readonly onBack: () => void;
}

/** The panel of one block: span, shares, stitch, proofs, and the way back. */
function BlockPanel(props: BlockPanelProps): JSX.Element {
  const { t, locale, formatDate, formatTime, formatDuration } = useI18n();
  const { block, proofs } = props;
  const proven = formatPercent(Math.round(block.provenShare * 10_000), locale);

  return (
    <div className="evidence-panel">
      <header className="evidence-header">
        <h3>{props.clientName}</h3>
        <p className="evidence-when">
          {formatDate(block.start)} {formatTime(block.start)} — {formatTime(block.end)}
        </p>
        <p className="evidence-status">
          {t(STATUS_KEYS[block.status])} · {t(CONFIDENCE_KEYS[block.confidence])}
        </p>
      </header>

      <dl className="counter" aria-label={t('a11y.provenShare', { share: proven })}>
        <div className="counter-item">
          <dt>{t('week.proven')}</dt>
          <dd>{proven}</dd>
        </div>
        <div className="counter-item">
          <dt>{t('week.assumed')}</dt>
          <dd>{formatDuration(block.assumedLeadInMinutes)}</dd>
        </div>
      </dl>

      <Stitch proofs={proofs} />
      <ProofList proofs={proofs} />

      <button type="button" onClick={props.onBack}>
        {t('common.back')}
      </button>
    </div>
  );
}

/**
 * The stitch: one glyph per proof, in the order the proofs happened, linked
 * by a dotted seam. The shape carries the source, the text carries it too.
 */
function Stitch(props: { readonly proofs: readonly Evidence[] }): JSX.Element {
  const { t } = useI18n();
  const ordered = sortEvidence(props.proofs);
  return (
    <div className="stitch" role="group" aria-label={t('evidence.stitch')}>
      {ordered.map((proof) => (
        <span key={proof.id} className="stitch-source">
          <span className="stitch-glyph" data-source={proof.source} aria-hidden="true" />
          <span className="visually-hidden">{t(KIND_KEYS[proof.kind])}</span>
          <span className="stitch-line" aria-hidden="true" />
        </span>
      ))}
    </div>
  );
}

/** The proofs of the block, in the order they happened. */
function ProofList(props: { readonly proofs: readonly Evidence[] }): JSX.Element {
  const { t } = useI18n();
  if (props.proofs.length === 0) return <p>{t('evidence.orphanHint')}</p>;
  const ordered = sortEvidence(props.proofs);
  return (
    <ul className="evidence-list" aria-live="polite" aria-label={t('evidence.title')}>
      {ordered.map((proof) => (
        <ProofItem key={proof.id} proof={proof} />
      ))}
    </ul>
  );
}

/** One proof: its kind, its instant, its text, then the fields of its source. */
function ProofItem(props: { readonly proof: Evidence }): JSX.Element {
  const { t, formatDate, formatTime } = useI18n();
  const proof = props.proof;
  const instant = proof.at ?? proof.start;
  return (
    <li className="evidence-item" data-source={proof.source}>
      <span className="evidence-kind">{t(KIND_KEYS[proof.kind])}</span>
      <span className="evidence-when">{instantLabel(instant, formatDate, formatTime)}</span>
      <span className="evidence-what">{proof.summary ?? proof.title ?? proof.text ?? ''}</span>
      <ProofFields proof={proof} />
    </li>
  );
}

function instantLabel(
  instant: Instant | undefined,
  formatDate: (instant: Instant) => string,
  formatTime: (instant: Instant) => string,
): string {
  if (instant === undefined) return '';
  return `${formatDate(instant)} ${formatTime(instant)}`;
}

/** The fields a proof carries, by source (D.4). */
function ProofFields(props: { readonly proof: Evidence }): JSX.Element {
  const { t } = useI18n();
  const text = useText(EXTRA_EVIDENCE);
  const rows = proofRows(props.proof, text);
  return (
    <span className="evidence-fields">
      {rows.map((row) => (
        <span key={row.key} className="evidence-field">
          <span className="evidence-label">{row.label}</span>
          <span className="evidence-value">{row.value}</span>
        </span>
      ))}
      {props.proof.attendees !== undefined && props.proof.attendees.length > 0 ? (
        <span className="evidence-field">
          <span className="evidence-label">{t('evidence.attendees')}</span>
          <span className="evidence-value">
            {props.proof.attendees.map((attendee) => attendee.email).join(', ')}
          </span>
        </span>
      ) : null}
    </span>
  );
}

interface ProofRow {
  readonly key: string;
  readonly label: string;
  readonly value: string | number;
}

/** One row per field the proof carries; nothing is invented. */
function proofRows(proof: Evidence, text: (key: string) => string): readonly ProofRow[] {
  const row = (key: string, value: string | number): ProofRow => ({
    key,
    label: text(`evidence.${key}`),
    value,
  });
  const rows: ProofRow[] = [];
  if (proof.repo !== undefined) rows.push(row('repo', proof.repo));
  if (proof.branch !== undefined) rows.push(row('branch', proof.branch));
  if (proof.authorEmail !== undefined) rows.push(row('author', proof.authorEmail));
  if (proof.added !== undefined) rows.push(row('added', proof.added));
  if (proof.deleted !== undefined) rows.push(row('deleted', proof.deleted));
  if (proof.file !== undefined) rows.push(row('file', proof.file));
  if (proof.line !== undefined) rows.push(row('line', proof.line));
  return rows;
}
