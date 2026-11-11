import { useState } from 'react';
import { I18nProvider, useI18n } from './i18n/index.ts';
import { useApp, useDispatch } from './state/store.tsx';
import { Month } from './screens/Month.tsx';
import { Week } from './screens/Week.tsx';
import { Evidence } from './screens/Evidence.tsx';
import { Clients } from './screens/Clients.tsx';
import { Invoice } from './screens/Invoice.tsx';
import { Settings } from './screens/Settings.tsx';

/**
 * The application shell (D.11).
 *
 * A small hand-made router — the app has six screens and no need for a
 * routing library. The navigation uses real buttons with `aria-current`, a
 * skip link leads to the main region, and the empty state offers the one
 * click that makes the app alive: `Load the sample month` (HEU-F-30).
 */

type View = 'month' | 'week' | 'evidence' | 'clients' | 'invoice' | 'settings';

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

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {t('app.skipToContent')}
      </a>
      <header className="app-header">
        <h1 className="app-title">{t('app.title')}</h1>
        <p className="app-tagline">{t('app.tagline')}</p>
      </header>
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

const NAV_ITEMS: readonly { id: View; label: MessageLabel }[] = [
  { id: 'month', label: 'nav.month' },
  { id: 'week', label: 'nav.week' },
  { id: 'evidence', label: 'nav.evidence' },
  { id: 'clients', label: 'nav.clients' },
  { id: 'invoice', label: 'nav.invoice' },
  { id: 'settings', label: 'nav.settings' },
];

type MessageLabel =
  | 'nav.month'
  | 'nav.week'
  | 'nav.evidence'
  | 'nav.clients'
  | 'nav.invoice'
  | 'nav.settings';

function Screen(props: { view: View }): JSX.Element {
  switch (props.view) {
    case 'week':
      return <Week />;
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

function EmptyState(): JSX.Element {
  const { t } = useI18n();
  const dispatch = useDispatch();
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
      </button>
    </div>
  );
}
