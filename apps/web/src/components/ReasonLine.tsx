import type { Block, BlockReason } from '@ghost-hours/core';
import { clientById } from '../state/selectors.ts';
import { useApp } from '../state/store.tsx';
import { useI18n } from '../i18n/index.ts';
import type { I18nApi } from '../i18n/index.ts';

/**
 * Saying why a block has these bounds (idea P-05).
 *
 * The domain returns a structured reason (`BlockReason`); the wording belongs
 * here, so the same fact reads correctly in English and in French and stays
 * testable without a DOM.
 */

export function reasonText(
  reason: BlockReason,
  t: I18nApi['t'],
  nameOf: (clientId: string) => string,
): string {
  switch (reason.kind) {
    case 'checkout':
      return t('reason.checkout', { repo: reason.repo, minutes: reason.minutes });
    case 'assumed':
      return `${t('reason.assumed', { minutes: reason.minutes })} ${t(`reason.boundedBy.${reason.boundedBy}`)}`;
    case 'resume':
      return t('reason.resume', { minutes: reason.pauseMinutes });
    case 'meeting':
      return t('reason.meeting');
    case 'manual':
      return t('reason.manual');
    case 'merged':
      return t('reason.merged', { count: reason.count });
    case 'trimmed':
      return t('reason.trimmed', { client: nameOf(reason.byClient) });
    case 'conflict':
      return t('reason.conflict', { client: nameOf(reason.withClient) });
  }
}

/** The reason of one block, or nothing when it carries none. */
export function BlockReason(props: { block: Block }): JSX.Element | null {
  const state = useApp();
  const { t } = useI18n();
  const reason = props.block.reason;
  if (reason === undefined) return null;
  const nameOf = (clientId: string): string => clientById(state, clientId)?.name ?? clientId;
  return (
    <p className="block-reason">
      <span className="visually-hidden">{t('block.reason')}: </span>
      {reasonText(reason, t, nameOf)}
    </p>
  );
}
