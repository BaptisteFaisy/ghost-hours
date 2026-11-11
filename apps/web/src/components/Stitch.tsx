import type { Evidence, EvidenceSource } from '@ghost-hours/core';
import type { MessageKey } from '../i18n/index.ts';
import { useI18n } from '../i18n/index.ts';

/**
 * The stitch (D.11): a seam along a block that links its proofs, one glyph
 * per source — a dot for a commit, a dash for a meeting, a feather for a note.
 *
 * The glyphs are CSS (`::before`) so they inherit the theme; the accessible
 * name is carried by a visually hidden text, never by the shape alone.
 */

const SOURCE_ORDER: readonly EvidenceSource[] = ['git', 'calendar', 'note', 'manual'];

const SOURCE_LABEL: Readonly<Record<EvidenceSource, MessageKey>> = {
  git: 'evidence.commit',
  calendar: 'evidence.meeting',
  note: 'evidence.note',
  manual: 'evidence.manual',
};

export interface StitchProps {
  readonly evidence: readonly Evidence[];
}

interface SourceTally {
  readonly source: EvidenceSource;
  readonly count: number;
}

function tallyBySource(evidence: readonly Evidence[]): readonly SourceTally[] {
  const counts = new Map<EvidenceSource, number>();
  for (const item of evidence) {
    counts.set(item.source, (counts.get(item.source) ?? 0) + 1);
  }
  return SOURCE_ORDER.filter((source) => (counts.get(source) ?? 0) > 0).map((source) => ({
    source,
    count: counts.get(source) ?? 0,
  }));
}

export function Stitch(props: StitchProps): JSX.Element {
  const { t } = useI18n();
  const tallies = tallyBySource(props.evidence);
  if (tallies.length === 0) return <div className="stitch" aria-label={t('evidence.stitch')} />;
  return (
    <div className="stitch" aria-label={t('evidence.stitch')}>
      {tallies.map((tally) => (
        <span key={tally.source} className="stitch-source">
          <span className="stitch-glyph" data-source={tally.source} aria-hidden="true" />
          <span className="visually-hidden">
            {t(SOURCE_LABEL[tally.source])} ({tally.count})
          </span>
          <span className="stitch-line" aria-hidden="true" />
        </span>
      ))}
    </div>
  );
}
