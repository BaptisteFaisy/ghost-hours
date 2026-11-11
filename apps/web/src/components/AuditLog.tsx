import { useI18n } from '../i18n/index.ts';
import { useApp } from '../state/store.tsx';
import { auditToCsv, auditToJson, verifyAudit } from '../state/audit.ts';
import type { AuditEntry } from '../state/audit.ts';
import { downloadText } from '../lib/download.ts';

/**
 * The decision log (idea C-06): who confirmed what, when, with a fingerprint
 * chained to the previous entry. It never leaves the browser; exporting it is
 * a download, not an upload.
 */

const SHOWN = 12;

export function AuditLog(): JSX.Element {
  const { t, locale, formatDate, formatTime } = useI18n();
  const { audit } = useApp();
  const check = verifyAudit(audit);
  const recent = audit.slice(-SHOWN).reverse();

  return (
    <section aria-label={t('audit.title')}>
      <h3>{t('audit.title')}</h3>
      <p>{t('audit.explainer')}</p>
      <p aria-live="polite">
        {check.ok
          ? t('audit.verifyOk', { count: audit.length })
          : t('audit.verifyBroken', { index: (check.brokenAt ?? 0) + 1 })}
      </p>
      {audit.length === 0 ? (
        <p>{t('audit.empty')}</p>
      ) : (
        <>
          <AuditTable entries={recent} formatDate={formatDate} formatTime={formatTime} />
          <button type="button" onClick={() => downloadText('ghost-hours-audit.csv', auditToCsv(audit, locale), 'text/csv;charset=utf-8')}>
            {t('audit.export')}
          </button>{' '}
          <button type="button" onClick={() => downloadText('ghost-hours-audit.json', auditToJson(audit), 'application/json')}>
            {t('audit.exportJson')}
          </button>
        </>
      )}
    </section>
  );
}

function AuditTable(props: {
  entries: readonly AuditEntry[];
  formatDate: (instant: number) => string;
  formatTime: (instant: number) => string;
}): JSX.Element {
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">When</th>
          <th scope="col">Action</th>
          <th scope="col">Detail</th>
          <th scope="col">Fingerprint</th>
        </tr>
      </thead>
      <tbody>
        {props.entries.map((entry) => (
          <tr key={entry.id}>
            <th scope="row">{`${props.formatDate(entry.at)} ${props.formatTime(entry.at)}`}</th>
            <td>{entry.action}</td>
            <td>{entry.detail ?? ''}</td>
            <td className="numeric">{entry.fingerprint.slice(0, 8)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
