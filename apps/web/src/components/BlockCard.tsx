import type { Block, Evidence, Instant, Minutes } from '@ghost-hours/core';
import { useApp, useDispatch } from '../state/store.tsx';
import { clientById } from '../state/selectors.ts';
import { useI18n } from '../i18n/index.ts';
import { Stitch } from './Stitch.tsx';
import { CONFIDENCE_KEYS } from './statusLabels.ts';

/**
 * One reconstructed block (D.11).
 *
 * The state is told apart three ways at once: the shape (the `data-status`
 * attribute drives the dashed / solid / hatched patterns of `theme.css`), a
 * textual label (never the colour alone, HEU-N-04) and the stitch, whose
 * glyphs tell which proofs hold the block up.
 *
 * The assumed part of the block is paler than its proven part: the lead-in
 * that no proof supports wears `.block-assumed`.
 */

/** How much a single adjust gesture moves an edge, in minutes. */
export const ADJUST_STEP_MINUTES: Minutes = 15;

export interface BlockCardProps {
  readonly block: Block;
  readonly evidence: readonly Evidence[];
  readonly selected?: boolean;
  readonly onOpen?: (blockId: string) => void;
}

function totalMinutes(block: Block): Minutes {
  return Math.max(0, Math.round((block.end - block.start) / 60_000));
}

function assumedMinutes(block: Block): Minutes {
  return Math.min(block.assumedLeadInMinutes, totalMinutes(block));
}

function provenMinutes(block: Block): Minutes {
  return Math.max(0, totalMinutes(block) - assumedMinutes(block));
}

function midpoint(block: Block): Instant {
  return Math.round((block.start + block.end) / 2);
}

export function BlockCard(props: BlockCardProps): JSX.Element {
  const { block, evidence, selected = false, onOpen } = props;
  const state = useApp();
  const { t, formatTime, formatDuration } = useI18n();
  const client = clientById(state, block.clientId);
  const clientName = client?.name ?? t('common.unknown');
  const assumed = assumedMinutes(block);
  const proven = provenMinutes(block);

  return (
    <div
      className="block"
      data-status={block.status}
      data-selected={selected ? 'yes' : 'no'}
      role="group"
      aria-label={t('a11y.block', {
        start: formatTime(block.start),
        end: formatTime(block.end),
        status: t(`status.${block.status}`),
      })}
    >
      <BlockHeading block={block} clientName={clientName} />

      <div className="block-parts">
        <div className="block-assumed" aria-label={t('week.assumed')}>
          {t('week.assumed')}: {formatDuration(assumed)}
        </div>
        <div aria-label={t('week.proven')}>
          {t('week.proven')}: {formatDuration(proven)}
        </div>
      </div>

      <progress
        className="block-proven-bar"
        max={1}
        value={block.provenShare}
        aria-label={t('a11y.provenShare', { share: `${Math.round(block.provenShare * 100)}%` })}
      />

      <Stitch evidence={evidence} />

      <BlockActions block={block} clientName={clientName} onOpen={onOpen} />
      <ClientPicker block={block} />
    </div>
  );
}

/**
 * The four words that identify a block: whose it is, what state it is in, how
 * solid its proof is, and when it happened. The confidence grade is named for
 * assistive technology and written on screen: a grade only one kind of reader
 * can perceive is a grade the reviewer never checks.
 */
function BlockHeading(props: { block: Block; clientName: string }): JSX.Element {
  const { t, formatTime } = useI18n();
  const { block } = props;
  const confidence = t(CONFIDENCE_KEYS[block.confidence]);
  return (
    <div className="block-heading">
      <span className="block-client">{props.clientName}</span>
      <span className="block-status">{t(`status.${block.status}`)}</span>
      <span className="block-confidence" aria-label={t('a11y.confidence', { confidence })}>
        {confidence}
      </span>
      <span className="block-times">
        {formatTime(block.start)}–{formatTime(block.end)}
      </span>
    </div>
  );
}

interface BlockActionsProps {
  readonly block: Block;
  readonly clientName: string;
  readonly onOpen?: (blockId: string) => void;
}

interface ActionButtonProps {
  readonly label: string;
  readonly glyph: string;
  readonly text: string;
  readonly tone?: 'primary' | 'danger';
  readonly onClick: () => void;
}

/**
 * A gesture button: the glyph stays decorative, the visible text label and the
 * `aria-label` carry the name of the gesture (never a bare glyph).
 */
function ActionButton(props: ActionButtonProps): JSX.Element {
  const className = props.tone === undefined ? undefined : props.tone;
  return (
    <button type="button" className={className} aria-label={props.label} onClick={props.onClick}>
      <span className="action-glyph" aria-hidden="true">
        {props.glyph}
      </span>
      <span className="action-text">{props.text}</span>
    </button>
  );
}

/** The gestures of a block: every one of them is a real button. */
function BlockActions(props: BlockActionsProps): JSX.Element {
  const { block, clientName, onOpen } = props;
  const dispatch = useDispatch();
  const { t, formatTime, formatDuration } = useI18n();
  const step = formatDuration(ADJUST_STEP_MINUTES);
  const at = formatTime(block.start);
  const shift = (start: Instant, end: Instant): void => {
    dispatch({ type: 'adjustBlock', blockId: block.id, start, end });
  };
  return (
    <div className="block-actions">
      <SettleButtons block={block} clientName={clientName} at={at} />
      <AdjustButtons step={step} onShiftBack={() => shift(block.start - STEP_MS, block.end)} onShiftForward={() => shift(block.start, block.end + STEP_MS)} />
      <ActionButton
        label={t('week.split')}
        glyph="✂"
        text={t('week.actionSplit')}
        onClick={() => dispatch({ type: 'splitBlock', blockId: block.id, at: midpoint(block) })}
      />
      <ActionButton
        label={t('week.openBlock')}
        glyph="ⓘ"
        text={t('week.actionInfo')}
        onClick={() => {
          dispatch({ type: 'selectBlock', blockId: block.id });
          onOpen?.(block.id);
        }}
      />
    </div>
  );
}

const STEP_MS = ADJUST_STEP_MINUTES * 60_000;

interface SettleButtonsProps {
  readonly block: Block;
  readonly clientName: string;
  readonly at: string;
}

/** Confirm or reject: the two gestures that settle a block. */
function SettleButtons(props: SettleButtonsProps): JSX.Element {
  const dispatch = useDispatch();
  const { t } = useI18n();
  const who = `${props.clientName} — ${props.at}`;
  return (
    <>
      <ActionButton
        label={`${t('week.confirm')} — ${who}`}
        glyph="✓"
        text={t('week.actionConfirm')}
        tone="primary"
        onClick={() => dispatch({ type: 'confirmBlock', blockId: props.block.id })}
      />
      <ActionButton
        label={`${t('week.reject')} — ${who}`}
        glyph="✗"
        text={t('week.actionReject')}
        tone="danger"
        onClick={() => dispatch({ type: 'rejectBlock', blockId: props.block.id })}
      />
    </>
  );
}

interface AdjustButtonsProps {
  readonly step: string;
  readonly onShiftBack: () => void;
  readonly onShiftForward: () => void;
}

/** Move the start back or the end forward by one adjust step. */
function AdjustButtons(props: AdjustButtonsProps): JSX.Element {
  const { t } = useI18n();
  return (
    <>
      <ActionButton
        label={`${t('week.adjust')} −${props.step}`}
        glyph="⤺"
        text={t('week.actionShiftBack')}
        onClick={props.onShiftBack}
      />
      <ActionButton
        label={`${t('week.adjust')} +${props.step}`}
        glyph="⤻"
        text={t('week.actionShiftForward')}
        onClick={props.onShiftForward}
      />
    </>
  );
}

interface ClientPickerProps {
  readonly block: Block;
}

function ClientPicker(props: ClientPickerProps): JSX.Element {
  const state = useApp();
  const dispatch = useDispatch();
  const { t } = useI18n();
  return (
    <label className="block-client-picker">
      <span className="visually-hidden">{t('week.changeClient')}</span>
      <select
        aria-label={`${t('week.changeClient')} — ${t(`status.${props.block.status}`)}`}
        value={props.block.clientId}
        onChange={(event) => {
          dispatch({
            type: 'changeClient',
            blockId: props.block.id,
            clientId: event.target.value,
            projectId: null,
          });
        }}
      >
        {state.clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
    </label>
  );
}
