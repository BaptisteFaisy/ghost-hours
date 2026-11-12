import type { Block, CredibilitySignal, Evidence, EvidenceKind, Instant } from '@ghost-hours/core';
import {
  credibilitySignals,
  formatPercent,
  isAssumptionDominant,
  isClean,
  monthRangeInZone,
  signedShare,
} from '@ghost-hours/core';
import { sortEvidence } from '@ghost-hours/mapping';
import { useApp, useDispatch } from '../state/store.tsx';
import { blockById, clientById, evidenceOfBlock } from '../state/selectors.ts';
import { useI18n } from '../i18n/index.ts';
import { BlockReason } from '../components/ReasonLine.tsx';
import { CONFIDENCE_KEYS, STATUS_KEYS } from '../components/statusLabels.ts';
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

/** The fields a proof can carry, each with the key that names it (D.4). */
type ProofField = 'repo' | 'branch' | 'author' | 'signature' | 'added' | 'deleted' | 'file' | 'line';

const FIELD_KEYS: Readonly<Record<ProofField, MessageKey>> = {
  repo: 'evidence.repo',
  branch: 'evidence.branch',
  author: 'evidence.author',
  signature: 'evidence.signature',
  added: 'evidence.added',
  deleted: 'evidence.deleted',
  file: 'evidence.file',
  line: 'evidence.line',
};

/** Each signal of the core, and the key that says what it means for the trust. */
const SIGNAL_KEYS: Readonly<Record<CredibilitySignal, MessageKey>> = {
  unsigned: 'signal.unsigned',
  'signature-invalid': 'signal.signature-invalid',
  'signature-unverified': 'signal.signature-unverified',
  'committer-differs': 'signal.committer-differs',
  'committed-before-authored': 'signal.committed-before-authored',
};

/** How the signature of a commit reads, once the signals have been computed. */
type SignatureStatus = 'good' | 'none' | 'bad' | 'unknown';

const SIGNATURE_KEYS: Readonly<Record<SignatureStatus, MessageKey>> = {
  good: 'evidence.signatureGood',
  none: 'evidence.signatureNone',
  bad: 'evidence.signatureBad',
  unknown: 'evidence.signatureUnknown',
};

/**
 * The signature status of a commit, read from the signals of the core: an
 * invalid signature, an unverifiable key, no signature at all — otherwise the
 * signature is good. The letters are Git's own (`%G?`), nothing is guessed.
 */
function signatureStatus(proof: Evidence): SignatureStatus {
  const signals = credibilitySignals(proof);
  if (signals.includes('signature-invalid')) return 'bad';
  if (signals.includes('signature-unverified')) return 'unknown';
  if (signals.includes('unsigned')) return 'none';
  return proof.signature === 'G' ? 'good' : 'unknown';
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
  const { t, locale, formatDuration } = useI18n();
  const { block, proofs } = props;
  const proven = formatPercent(Math.round(block.provenShare * 10_000), locale);

  return (
    <div className="evidence-panel">
      <BlockHeader block={block} proofs={proofs} clientName={props.clientName} />

      {isAssumptionDominant(block) && (
        <p className="evidence-assumed-warning" role="note">
          {t('evidence.assumedDominant')}
        </p>
      )}
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

      <BlockReason block={block} />
      <Stitch proofs={proofs} />
      <ProofList proofs={proofs} />

      <button type="button" aria-label={t('a11y.closePanel')} onClick={props.onBack}>
        {t('common.back')}
      </button>
    </div>
  );
}

interface BlockHeaderProps {
  readonly block: Block;
  readonly proofs: readonly Evidence[];
  readonly clientName: string;
}

/** The head of the panel: who, when, how confident — and how verifiable. */
function BlockHeader(props: BlockHeaderProps): JSX.Element {
  const { t, formatDate, formatTime } = useI18n();
  const { block } = props;
  return (
    <header className="evidence-header">
      <h3>{props.clientName}</h3>
      <p className="evidence-when">
        {formatDate(block.start)} {formatTime(block.start)} — {formatTime(block.end)}
      </p>
      <p className="evidence-status">
        {t(STATUS_KEYS[block.status])} ·{' '}
        <span
          className="evidence-confidence"
          aria-label={t('a11y.confidence', {
            confidence: t(CONFIDENCE_KEYS[block.confidence]),
          })}
        >
          {t(CONFIDENCE_KEYS[block.confidence])}
        </span>
      </p>
      <BlockCredibility proofs={props.proofs} />
    </header>
  );
}

/**
 * The verifiability of the block: the share of its commits that carry a
 * trusted signature, and the proofs that deserve a second look. A block
 * without a commit (a meeting, a note, a manual entry) says nothing about
 * signatures, so it stays silent.
 */
function BlockCredibility(props: { readonly proofs: readonly Evidence[] }): JSX.Element | null {
  const { t } = useI18n();
  const commits = props.proofs.filter((proof) => proof.kind === 'commit');
  if (commits.length === 0) return null;
  const share = `${Math.round(signedShare(props.proofs) * 100)}%`;
  const flagged = props.proofs.filter((proof) => !isClean(proof)).length;
  return (
    <p className="evidence-credibility">
      <span className="evidence-label">{t('evidence.credibility')}</span>
      <span className="evidence-value">
        {t('evidence.signedShare', { share, flagged })}
      </span>
    </p>
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
      <ProofSignals proof={proof} />
    </li>
  );
}

/**
 * The credibility signals of a proof, as chips under the proof.
 *
 * The core computes the signals; the screen only says what each one means
 * for the trust. A proof without a signal shows nothing: silence is the
 * normal case, and a chip would be noise.
 */
function ProofSignals(props: { readonly proof: Evidence }): JSX.Element | null {
  const { t } = useI18n();
  const signals = credibilitySignals(props.proof);
  if (signals.length === 0) return null;
  return (
    <ul className="evidence-signals">
      {signals.map((signal) => (
        <li key={signal} className="evidence-signal" data-signal={signal}>
          {t(SIGNAL_KEYS[signal])}
        </li>
      ))}
    </ul>
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
  const rows = proofRows(props.proof, t);
  return (
    <span className="evidence-fields">
      {rows.map((row) => (
        <span key={row.key} className="evidence-field">
          <span className="evidence-label">{row.label}</span>
          <span className="evidence-value">{row.value}</span>
          {row.note !== undefined ? <span className="evidence-note">{row.note}</span> : null}
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
  /** A second line under the value: who signed the commit. */
  readonly note?: string;
}

/** One row per field the proof carries; nothing is invented. */
function proofRows(
  proof: Evidence,
  translate: (key: MessageKey, values?: Readonly<Record<string, string | number>>) => string,
): readonly ProofRow[] {
  const row = (field: ProofField, value: string | number, note?: string): ProofRow => ({
    key: field,
    label: translate(FIELD_KEYS[field]),
    value,
    note,
  });
  const rows: ProofRow[] = [];
  if (proof.repo !== undefined) rows.push(row('repo', proof.repo));
  if (proof.branch !== undefined) rows.push(row('branch', proof.branch));
  if (proof.authorEmail !== undefined) rows.push(row('author', proof.authorEmail));
  if (proof.kind === 'commit') {
    const signer =
      proof.signer === undefined
        ? undefined
        : translate('evidence.signer', { signer: proof.signer });
    rows.push(row('signature', translate(SIGNATURE_KEYS[signatureStatus(proof)]), signer));
  }
  if (proof.added !== undefined) rows.push(row('added', proof.added));
  if (proof.deleted !== undefined) rows.push(row('deleted', proof.deleted));
  if (proof.file !== undefined) rows.push(row('file', proof.file));
  if (proof.line !== undefined) rows.push(row('line', proof.line));
  return rows;
}
