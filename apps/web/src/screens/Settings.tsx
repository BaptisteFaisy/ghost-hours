import { useI18n } from '../i18n/index.ts';
import { useApp, useDispatch, eraseEverything } from '../state/store.tsx';
import { ImportPanel } from '../components/ImportPanel.tsx';
import type { ReconstructionSettings } from '@ghost-hours/core';

/**
 * The settings screen (D.11): the reconstruction parameters, the language,
 * and the data (sample month, erase).
 */
export function Settings(): JSX.Element {
  const { t } = useI18n();
  const state = useApp();
  const dispatch = useDispatch();

  return (
    <section className="card" aria-label={t('settings.title')}>
      <h2>{t('settings.title')}</h2>
      <p>{t('settings.privacy')}</p>
      <LanguageField />
      <ReconstructionFields />
      <CalibrationPanel />
      <ImportPanel />
      <section aria-label={t('settings.data')}>
        <h3>{t('settings.data')}</h3>
        <button type="button" onClick={() => dispatch({ type: 'loadSampleMonth' })}>
          {t('settings.loadSample')}
        </button>
        <button
          type="button"
          onClick={() => {
            void eraseEverything();
            dispatch({ type: 'resetAll' });
          }}
        >
          {t('settings.eraseData')}
        </button>
      </section>
      <p>{`${t('settings.timeZone')}: ${state.settings.timeZone}`}</p>
    </section>
  );
}

/**
 * The lead-in calibration (HEU-F-17): after ten corrections the median of what
 * the user actually kept is offered as the new default. Offered, never applied:
 * a tool that changes its own assumptions silently is a tool that inflates.
 */
function CalibrationPanel(): JSX.Element {
  const { t, formatDuration } = useI18n();
  const state = useApp();
  const dispatch = useDispatch();
  const calibration = state.calibration;
  const samples = calibration?.samples ?? 0;
  return (
    <section aria-label={t('calibration.title')}>
      <h3>{t('calibration.title')}</h3>
      {calibration === null || calibration.suggestedLeadInMinutes === null ? (
        <p>{t('calibration.notEnough', { samples })}</p>
      ) : (
        <>
          <p>
            {t('calibration.suggestion', {
              minutes: formatDuration(calibration.suggestedLeadInMinutes),
              samples: calibration.samples,
            })}
          </p>
          <button
            type="button"
            onClick={() =>
              dispatch({
                type: 'setSettings',
                patch: { leadInDefaultMinutes: calibration.suggestedLeadInMinutes ?? 30 },
              })
            }
          >
            {t('calibration.apply')}
          </button>
        </>
      )}
      <p>{t('calibration.neverAuto')}</p>
    </section>
  );
}

function LanguageField(): JSX.Element {
  const { t, locale, setLocale } = useI18n();
  return (
    <section aria-label={t('settings.language')}>
      <h3>{t('settings.language')}</h3>
      <label htmlFor="locale-select">{t('nav.language')}</label>
      <select
        id="locale-select"
        value={locale}
        onChange={(event) => setLocale(event.target.value === 'fr' ? 'fr' : 'en')}
      >
        <option value="en">{t('settings.english')}</option>
        <option value="fr">{t('settings.french')}</option>
      </select>
    </section>
  );
}

const NUMBER_FIELDS: readonly { label: SettingsKey; key: keyof ReconstructionSettings }[] = [
  { label: 'settings.gapMax', key: 'gapMaxMinutes' },
  { label: 'settings.leadInDefault', key: 'leadInDefaultMinutes' },
  { label: 'settings.leadInMax', key: 'leadInMaxMinutes' },
  { label: 'settings.minSession', key: 'minSessionMinutes' },
  { label: 'settings.tail', key: 'tailMinutes' },
  { label: 'settings.dayLength', key: 'dayLengthMinutes' },
  { label: 'settings.fullDayFrom', key: 'fullDayFromMinutes' },
  { label: 'settings.halfDayFrom', key: 'halfDayFromMinutes' },
];

type SettingsKey =
  | 'settings.gapMax'
  | 'settings.leadInDefault'
  | 'settings.leadInMax'
  | 'settings.minSession'
  | 'settings.tail'
  | 'settings.dayLength'
  | 'settings.fullDayFrom'
  | 'settings.halfDayFrom';

function ReconstructionFields(): JSX.Element {
  const { t } = useI18n();
  const state = useApp();
  const dispatch = useDispatch();
  return (
    <section aria-label={t('settings.reconstruction')}>
      <h3>{t('settings.reconstruction')}</h3>
      {NUMBER_FIELDS.map((field) => (
        <NumberField
          key={field.key}
          label={t(field.label)}
          value={Number(state.settings[field.key])}
          onChange={(value) =>
            dispatch({
              type: 'setSettings',
              patch: { [field.key]: value } satisfies Partial<ReconstructionSettings>,
            })
          }
        />
      ))}
      <label htmlFor="timezone-input">{t('settings.timeZone')}</label>
      <input
        id="timezone-input"
        value={state.settings.timeZone}
        onChange={(event) => dispatch({ type: 'setSettings', patch: { timeZone: event.target.value } })}
      />
    </section>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}): JSX.Element {
  const { label, value, onChange } = props;
  const id = `field-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </>
  );
}
