import { useState } from 'react';
import { buildDataset } from '@ghost-hours/core';
import { useApp, useDispatch } from '../state/store.tsx';
import { useI18n } from '../i18n/index.ts';
import { classifyAndRead, readEvidenceFile, readText } from '../state/fileImport.ts';
import { downloadText } from '../lib/download.ts';

/**
 * Getting real evidence into the app (D.7 P2, HEU-F-01/02/04).
 *
 * Three labelled inputs for people who know what they have, and one drop zone
 * for everyone else: the zone sorts the files by what they are. Nothing is
 * uploaded — every file is read inside the tab.
 */
export function ImportPanel(): JSX.Element {
  const { t } = useI18n();
  const state = useApp();
  const [messages, setMessages] = useState<readonly string[]>([]);

  return (
    <section aria-label={t('settings.importTitle')}>
      <h3>{t('settings.importTitle')}</h3>
      <p>{t('settings.importHint')}</p>
      <DropZone report={setMessages} />
      <LabelledInputs report={setMessages} />
      <DatasetExport />
      <ImportReport messages={messages} recent={state.importReport} />
    </section>
  );
}

function ImportReport(props: { messages: readonly string[]; recent: readonly string[] }): JSX.Element {
  return (
    <ul aria-live="polite">
      {props.messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
      {props.recent.slice(-4).map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/** One drop zone that sorts the files by what they are. */
function DropZone(props: { report: (messages: readonly string[]) => void }): JSX.Element {
  const { t } = useI18n();
  const dispatch = useDispatch();
  const [dragging, setDragging] = useState(false);

  async function accept(files: readonly File[]): Promise<void> {
    const plan = await classifyAndRead(files);
    const said: string[] = [];
    if (plan.dataset !== null) {
      dispatch({ type: 'importDataset', dataset: plan.dataset });
      said.push(t('settings.datasetImported'));
    }
    if (plan.evidence.length > 0) {
      dispatch({ type: 'importEvidence', evidence: plan.evidence });
      said.push(t('settings.importedEvidence', { count: plan.evidence.length }));
    }
    for (const ics of plan.ics) dispatch({ type: 'importCalendar', ics });
    if (plan.ics.length > 0) said.push(t('settings.importedCalendar', { count: plan.ics.length, skipped: 0 }));
    if (plan.notes.length > 0) {
      dispatch({ type: 'importNotes', notes: plan.notes });
      said.push(t('settings.importedNotes', { count: plan.notes.length, skipped: plan.notesRejected }));
    }
    for (const rejected of plan.rejected) {
      said.push(t('settings.importFailed', { name: rejected.name, reason: rejected.reason }));
    }
    props.report(said);
  }

  return (
    <div
      className="card"
      role="presentation"
      aria-label={t('settings.importDrop')}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void accept([...event.dataTransfer.files]);
      }}
    >
      <p>{dragging ? t('settings.importDrop') : t('settings.importHint')}</p>
    </div>
  );
}

/** The four labelled inputs, one per source. */
function LabelledInputs(props: { report: (messages: readonly string[]) => void }): JSX.Element {
  const { t } = useI18n();
  const dispatch = useDispatch();

  async function onEvidence(files: readonly File[]): Promise<void> {
    const first = files[0];
    if (first === undefined) return;
    const parsed = readEvidenceFile(await readText(first));
    if (!parsed.ok) {
      props.report([t('settings.importFailed', { name: first.name, reason: parsed.errors.join('; ') })]);
      return;
    }
    dispatch({ type: 'importEvidence', evidence: parsed.value });
    props.report([t('settings.importedEvidence', { count: parsed.value.length })]);
  }

  async function onCalendar(files: readonly File[]): Promise<void> {
    const first = files[0];
    if (first === undefined) return;
    dispatch({ type: 'importCalendar', ics: await readText(first) });
    props.report([t('settings.importedCalendar', { count: 1, skipped: 0 })]);
  }

  async function onNotes(files: readonly File[]): Promise<void> {
    const notes = await Promise.all(files.map(async (file) => ({ path: file.name, content: await readText(file) })));
    if (notes.length === 0) return;
    dispatch({ type: 'importNotes', notes });
    props.report([t('settings.importedNotes', { count: notes.length, skipped: 0 })]);
  }

  async function onDataset(files: readonly File[]): Promise<void> {
    const first = files[0];
    if (first === undefined) return;
    const plan = await classifyAndRead([first]);
    if (plan.dataset === null) {
      props.report([t('settings.datasetRejected', { reason: plan.rejected[0]?.reason ?? 'unparsable' })]);
      return;
    }
    dispatch({ type: 'importDataset', dataset: plan.dataset });
    props.report([t('settings.datasetImported')]);
  }

  return (
    <>
      <FileInput id="import-evidence" label={t('settings.importEvidence')} accept=".json,application/json" onFiles={onEvidence} />
      <FileInput id="import-calendar" label={t('settings.importCalendar')} accept=".ics,text/calendar" onFiles={onCalendar} />
      <FileInput id="import-notes" label={t('settings.importNotes')} accept=".md,.markdown,.txt" multiple onFiles={onNotes} />
      <FileInput id="import-dataset" label={t('settings.importDataset')} accept=".json,application/json" onFiles={onDataset} />
    </>
  );
}

function FileInput(props: {
  id: string;
  label: string;
  accept: string;
  multiple?: boolean;
  onFiles: (files: readonly File[]) => Promise<void>;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <p>
      <label htmlFor={props.id}>{props.label}</label>{' '}
      <input
        id={props.id}
        type="file"
        accept={props.accept}
        multiple={props.multiple === true}
        aria-label={`${props.label} — ${t('a11y.fileInput')}`}
        onChange={(event) => void props.onFiles([...(event.target.files ?? [])])}
      />
    </p>
  );
}

function DatasetExport(): JSX.Element {
  const { t } = useI18n();
  const state = useApp();
  return (
    <button
      type="button"
      onClick={() =>
        downloadText(
          'ghost-hours-dataset.json',
          `${JSON.stringify(
            buildDataset({
              exportedAt: Date.now(),
              locale: state.locale,
              settings: state.settings,
              clients: state.clients,
              blocks: state.blocks,
              conflicts: state.conflicts,
              declaredMinutes: state.declaredMinutes,
              invoicedPeriods: state.invoicedPeriods,
            }),
            null,
            2,
          )}\n`,
          'application/json',
        )
      }
    >
      {t('settings.exportData')}
    </button>
  );
}
