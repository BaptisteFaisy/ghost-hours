import { useState } from 'react';
import { useI18n } from '../i18n/index.ts';
import { useDispatch } from '../state/store.tsx';
import { fetchRealMonth } from '../state/realMonth.ts';

/**
 * One click loads the real anonymized month (October 2026).
 *
 * The fixture is fetched lazily — a 219 KB JSON file has no business in the
 * initial bundle — and the button borrows the app's own busy wording while
 * the import and the reconstruction run, so a slow click is never a dead one.
 * The same button serves the empty state and the settings screen.
 */
export function LoadRealMonthButton(): JSX.Element {
  const { t } = useI18n();
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const month = await fetchRealMonth();
      dispatch({ type: 'importRealMonth', month });
    } finally {
      setLoading(false);
    }
  }

  return (
    <button type="button" disabled={loading} onClick={() => void load()}>
      {loading ? t('app.busy') : t('real.load')}
    </button>
  );
}
