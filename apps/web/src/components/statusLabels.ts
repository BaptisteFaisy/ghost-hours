import type { Block } from '@ghost-hours/core';
import type { MessageKey } from '../i18n/index.ts';

/**
 * The words of a block's status and of its confidence, in one place.
 *
 * The evidence panel, the block card of the week grid and the conflict list all
 * show them; three copies of the same map drift apart, and a drift in a label is
 * a lie about the state of a block.
 */
export const STATUS_KEYS: Readonly<Record<Block['status'], MessageKey>> = {
  proposed: 'status.proposed',
  confirmed: 'status.confirmed',
  rejected: 'status.rejected',
  conflict: 'status.conflict',
  locked: 'status.locked',
};

/**
 * The three grades of the proven share (HEU-F-15): solid at 0.8 and above,
 * likely at 0.5, to confirm below. The grade is a word, never a colour alone.
 */
export const CONFIDENCE_KEYS: Readonly<Record<Block['confidence'], MessageKey>> = {
  solid: 'status.solid',
  likely: 'status.likely',
  'to-confirm': 'status.toConfirm',
};
