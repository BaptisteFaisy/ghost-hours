import { useState } from 'react';
import { I18nProvider, useI18n } from './i18n/index.ts';
import { useApp, useDispatch } from './state/store.tsx';
import { Month } from './screens/Month.tsx';
import { Week } from './screens/Week.tsx';
import { Conflicts } from './screens/Conflicts.tsx';
import { Evidence } from './screens/Evidence.tsx';
import { Clients } from './screens/Clients.tsx';
import { Invoice } from './screens/Invoice.tsx';
import { Settings } from './screens/Settings.tsx';
import { ImportPanel } from './components/ImportPanel.tsx';
import { LoadRealMonthButton } from './components/realMonth.tsx';
import type { StorageWarning } from './state/types.ts';
import type { MessageKey } from './i18n/index.ts';

/**
 * The application shell (D.11).
 *
 * A small hand-made router — the app has six screens and no need for a
 * routing library. The navigation uses real buttons with `aria-current`, a
 * skip link leads to the main region, and the empty state offers the one
 * click that makes the app alive: `Load the sample month` (HEU-F-30).
 */

type View = 'month' | 'week' | 'conflicts' | 'evidence' | 'clients' | 'invoice' | 'settings';

export function App(): JSX.Element {
  return (
    <I18nProvider>
      <Shell />
    </I18nProvider>
  );
}

function Shell(): JSX.Element {
  const { t } = useI18n();
  const state = useApp();
  const [view, setView] = useState<View>('month');
  const openConflicts = state.conflicts.filter((conflict) => !conflict.resolved).length;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {t('app.skipToContent')}
      </a>
      <header className="app-header">
        <h1 className="app-title">{t('app.title')}</h1>
        <p className="app-tagline">{t('app.tagline')}</p>
      </header>
      {state.busy && (
        <p role="status" aria-live="polite">
          {t('app.busy')}
        </p>
      )}
      <StorageWarning />
      <RealMonthNotice />
      <nav className="app-nav" aria-label={t('nav.label')}>
        <ul>
          {NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-current={view === item.id ? 'page' : undefined}
                onClick={() => setView(item.id)}
              >
                {t(item.label)}
                {item.id === 'conflicts' && openConflicts > 0 && (
                  <span className="numeric"> ({openConflicts})</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <main className="app-main" id="main" tabIndex={-1}>
        {state.status === 'empty' ? <EmptyState /> : <Screen view={view} />}
      </main>
      <footer className="app-footer">
        <p>{t('settings.privacy')}</p>
      </footer>
    </div>
  );
}

/**
 * The shell says out loud when the browser refuses to keep the data (private
 * mode, storage full, IndexedDB blocked). A review that will not survive a
 * reload announces itself where the reader is looking — the import report of
 * the settings screen is a trace, not a warning.
 */
/**
 * One sentence per way the storage can fail, because they do not mean the same
 * thing: a refused write means this session will not survive a reload, an
 * unreadable or invalid read means the previous session is gone.
 */
const STORAGE_MESSAGE: Readonly<Record<StorageWarning['kind'], MessageKey>> = {
  read: 'error.persistRead',
  parse: 'error.persistParse',
  write: 'error.persistence',
};

function StorageWarning(): JSX.Element | null {
  const { t } = useI18n();
  const { storageWarning } = useApp();
  if (storageWarning == null) return null;
  return (
    <p className="storage-warning" role="alert">
      <strong>{t(STORAGE_MESSAGE[storageWarning.kind])}</strong>{' '}
      <span className="numeric">{storageWarning.reason}</span>
    </p>
  );
}

/**
 * Provenance, not a warning: when the month on screen is the real anonymized
 * one, the shell says so in a note — a demo must never be mistaken for the
 * reader's own work, and a real month must never look like invented data.
 */
function RealMonthNotice(): JSX.Element | null {
  const { t } = useI18n();
  const { datasetKind } = useApp();
  if (datasetKind !== 'real') return null;
  return (
    <p className="real-month-notice" role="note">
      {t('real.notice')}
    </p>
  );
}

const NAV_ITEMS: readonly { id: View; label: MessageLabel }[] = [
  { id: 'month', label: 'nav.month' },
  { id: 'week', label: 'nav.week' },
  { id: 'conflicts', label: 'nav.conflicts' },
  { id: 'evidence', label: 'nav.evidence' },
  { id: 'clients', label: 'nav.clients' },
  { id: 'invoice', label: 'nav.invoice' },
  { id: 'settings', label: 'nav.settings' },
];

type MessageLabel =
  | 'nav.month'
  | 'nav.week'
  | 'nav.conflicts'
  | 'nav.evidence'
  | 'nav.clients'
  | 'nav.invoice'
  | 'nav.settings';

function Screen(props: { view: View }): JSX.Element {
  switch (props.view) {
    case 'week':
      return <Week />;
    case 'conflicts':
      return <Conflicts />;
    case 'evidence':
      return <Evidence />;
    case 'clients':
      return <Clients />;
    case 'invoice':
      return <Invoice />;
    case 'settings':
      return <Settings />;
    case 'month':
      return <Month />;
    default:
      return <Month />;
  }
}

/**
 * Nothing loaded yet: the one click that makes the app alive, and the door to
 * the reader's own files. The import panel opens in place — the shell shows
 * this state instead of the screens, so sending the reader to Settings would
 * have gone nowhere.
 */
function EmptyState(): JSX.Element {
  const { t } = useI18n();
  const dispatch = useDispatch();
  const [importing, setImporting] = useState(false);
  return (
    <div className="empty-state">
      <h1>{t('empty.title')}</h1>
      <p>{t('empty.body')}</p>
      <button
        type="button"
        className="primary"
        onClick={() => dispatch({ type: 'loadSampleMonth' })}
      >
        {t('empty.loadSample')}
      </button>{' '}
      <LoadRealMonthButton />{' '}
      <button
        type="button"
        aria-expanded={importing}
        onClick={() => setImporting((open) => !open)}
      >
        {t('empty.import')}
      </button>
      {importing && <ImportPanel />}
    </div>
  );
}
