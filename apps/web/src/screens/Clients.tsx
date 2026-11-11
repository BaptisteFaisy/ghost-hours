import { useState } from 'react';
import type { FormEvent } from 'react';
import type { BillingMode, Client, Evidence, MappingRule, RoundingMode, RoundingScope } from '@ghost-hours/core';
import { makeClient, suggestCandidates, suggestRule } from '@ghost-hours/mapping';
import type { SuggestedCandidate } from '@ghost-hours/mapping';
import { useApp, useDispatch } from '../state/store.tsx';
import { clientById } from '../state/selectors.ts';
import { useI18n } from '../i18n/index.ts';
import type { MessageKey } from '../i18n/index.ts';
import { useText } from './Evidence.tsx';
import type { ExtraPair } from './Evidence.tsx';

/**
 * The clients screen (D.4, HEU-F-07/08/09, D.7 P3).
 *
 * Three things live here: the clients with their billing terms and the rules
 * that claim proofs for them; the proofs no rule claims yet, each one with the
 * clients the heuristics believe plausible and the gesture that writes the rule
 * in one move; and the form that adds a client. Associating a proof re-runs the
 * reconstruction in the store, so the proof leaves the orphan list by itself.
 */

const MODE_KEYS: Readonly<Record<BillingMode, MessageKey>> = {
  hourly: 'clients.modeHourly',
  'daily-thresholds': 'clients.modeDailyThresholds',
  'daily-proportional': 'clients.modeDailyProportional',
};
const ROUNDING_KEYS: Readonly<Record<RoundingMode, MessageKey>> = {
  none: 'clients.roundingNone',
  nearest: 'clients.roundingNearest',
  up: 'clients.roundingUp',
};
const SCOPE_KEYS: Readonly<Record<RoundingScope, MessageKey>> = {
  session: 'clients.scopeSession',
  day: 'clients.scopeDay',
  total: 'clients.scopeTotal',
};

/** Keys the dictionaries do not carry yet — they are reported, not invented. */
const EXTRA: Readonly<Record<string, ExtraPair>> = {
  'rule.repo': { en: 'Repository', fr: 'Dépôt' },
  'rule.remote-contains': { en: 'Remote contains', fr: 'Le distant contient' },
  'rule.attendee-domain': { en: 'Attendee domain', fr: 'Domaine de participant' },
  'rule.title-contains': { en: 'Title contains', fr: 'Le titre contient' },
  'rule.note-tag': { en: 'Note tag', fr: 'Étiquette de note' },
  'rule.manual': { en: 'Manual', fr: 'Manuel' },
  'clients.projects': { en: 'Projects', fr: 'Projets' },
  'clients.projectsHint': { en: 'Comma separated names.', fr: 'Noms séparés par des virgules.' },
  'clients.nameRequired': { en: 'The name of the client is required.', fr: 'Le nom du client est obligatoire.' },
  'clients.rateRequired': {
    en: 'The hourly rate must be a positive amount.',
    fr: 'Le taux horaire doit être un montant positif.',
  },
  'clients.associate': { en: 'Associate to this client', fr: 'Associer à ce client' },
  'clients.noOrphans': { en: 'Every proof has a client.', fr: 'Chaque preuve a un client.' },
};

export function Clients(): JSX.Element {
  const state = useApp();
  const dispatch = useDispatch();
  const { t } = useI18n();
  return (
    <section className="card clients-screen" aria-label={t('clients.title')}>
      <h2>{t('clients.title')}</h2>
      <ClientForm />
      {state.clients.length === 0 ? <p>{t('clients.noClients')}</p> : null}
      <ul className="client-list" aria-live="polite" aria-label={t('clients.title')}>
        {state.clients.map((client) => (
          <ClientCard
            key={client.id}
            client={client}
            onRemoveRule={(ruleId) => dispatch({ type: 'removeRule', ruleId })}
          />
        ))}
      </ul>
      <OrphanList
        orphans={state.orphanEvidence}
        onAssociate={(proof, clientId) =>
          dispatch({ type: 'upsertRule', rule: suggestRule(proof, clientId) })
        }
      />
    </section>
  );
}

/** One client: its billing terms, its projects, its rules. */
function ClientCard(props: {
  readonly client: Client;
  readonly onRemoveRule: (ruleId: string) => void;
}): JSX.Element {
  const { t, formatMoney } = useI18n();
  const text = useText(EXTRA);
  const client = props.client;
  const projects = client.projects.map((project) => project.name).join(', ');
  return (
    <li className="client-card card">
      <h3>{client.name}</h3>
      <dl className="counter">
        <Term label={t('clients.mode')} value={t(MODE_KEYS[client.mode])} />
        <Term label={t('clients.rate')} value={formatMoney(client.rateCents, client.currency)} numeric />
        <Term label={t('clients.dayRate')} value={formatMoney(client.dayRateCents, client.currency)} numeric />
        <Term label={t('clients.currency')} value={client.currency} />
        <Term
          label={t('clients.rounding')}
          value={`${t(ROUNDING_KEYS[client.rounding.mode])} · ${t(SCOPE_KEYS[client.rounding.scope])}`}
        />
        <Term label={text('clients.projects')} value={projects.length === 0 ? t('common.none') : projects} />
      </dl>
      <RuleList rules={client.rules} onRemove={props.onRemoveRule} />
    </li>
  );
}

/** One label / value pair of a client card. */
function Term(props: {
  readonly label: string;
  readonly value: string;
  readonly numeric?: boolean;
}): JSX.Element {
  return (
    <div className="counter-item">
      <dt>{props.label}</dt>
      <dd className={props.numeric === true ? 'numeric' : undefined}>{props.value}</dd>
    </div>
  );
}

/** The rules that claim proofs for one client (HEU-F-08). */
function RuleList(props: {
  readonly rules: readonly MappingRule[];
  readonly onRemove: (ruleId: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  const text = useText(EXTRA);
  return (
    <div className="client-rules">
      <h4>{t('clients.rules')}</h4>
      {props.rules.length === 0 ? <p>{t('common.none')}</p> : null}
      {props.rules.length === 0 ? null : (
        <table>
          <caption className="visually-hidden">{t('clients.rules')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('clients.ruleType')}</th>
              <th scope="col">{t('clients.ruleValue')}</th>
              <th scope="col">
                <span className="visually-hidden">{t('common.delete')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {props.rules.map((rule) => (
              <tr key={rule.id}>
                <td>{text(`rule.${rule.type}`)}</td>
                <td>{rule.value}</td>
                <td>
                  <button
                    type="button"
                    className="danger"
                    aria-label={`${t('clients.removeRule')} — ${rule.value}`}
                    onClick={() => props.onRemove(rule.id)}
                  >
                    {t('common.delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** The proofs no rule claims yet (HEU-F-09). */
function OrphanList(props: {
  readonly orphans: readonly Evidence[];
  readonly onAssociate: (proof: Evidence, clientId: string) => void;
}): JSX.Element {
  const state = useApp();
  const { t } = useI18n();
  const text = useText(EXTRA);
  return (
    <div className="client-orphans">
      <h3>{t('evidence.orphans')}</h3>
      <p>{t('evidence.orphanHint')}</p>
      {props.orphans.length === 0 ? <p>{text('clients.noOrphans')}</p> : null}
      <ul className="evidence-list" aria-live="polite" aria-label={t('evidence.orphans')}>
        {props.orphans.map((proof) => (
          <OrphanItem
            key={proof.id}
            proof={proof}
            candidates={suggestCandidates(proof, state.clients)}
            onAssociate={props.onAssociate}
          />
        ))}
      </ul>
    </div>
  );
}

/** One orphan proof: what it is, who might own it, and the one gesture. */
function OrphanItem(props: {
  readonly proof: Evidence;
  readonly candidates: readonly SuggestedCandidate[];
  readonly onAssociate: (proof: Evidence, clientId: string) => void;
}): JSX.Element {
  const state = useApp();
  const { t, formatDate, formatTime } = useI18n();
  const proof = props.proof;
  const instant = proof.at ?? proof.start;
  const when = instant === undefined ? '' : `${formatDate(instant)} ${formatTime(instant)}`;
  const what = proof.summary ?? proof.title ?? proof.text ?? proof.repo ?? '';
  return (
    <li className="evidence-item" data-source={proof.source}>
      <span className="evidence-kind">{t(`evidence.${proof.kind}` as MessageKey)}</span>
      <span className="evidence-when">{when}</span>
      <span className="evidence-what">{what}</span>
      <ul className="candidate-list">
        {props.candidates.map((candidate) => (
          <CandidateRow
            key={candidate.clientId}
            candidate={candidate}
            name={clientById(state, candidate.clientId)?.name ?? t('common.unknown')}
            onAssociate={() => props.onAssociate(proof, candidate.clientId)}
          />
        ))}
      </ul>
    </li>
  );
}

/** One suggested client, with the reason and the confidence the heuristics give. */
function CandidateRow(props: {
  readonly candidate: SuggestedCandidate;
  readonly name: string;
  readonly onAssociate: () => void;
}): JSX.Element {
  const { locale } = useI18n();
  const text = useText(EXTRA);
  const confidence = Math.round(props.candidate.confidence * 100);
  const label = text('clients.associate');
  return (
    <li className="candidate-item">
      <span className="candidate-name">{props.name}</span>
      <span className="candidate-confidence numeric">
        {locale === 'fr' ? `${confidence} %` : `${confidence}%`}
      </span>
      <span className="candidate-reason">{props.candidate.reason}</span>
      <button type="button" className="primary" aria-label={`${label} — ${props.name}`} onClick={props.onAssociate}>
        {label}
      </button>
    </li>
  );
}

interface FormState {
  readonly name: string;
  readonly mode: BillingMode;
  readonly rate: string;
  readonly currency: string;
  readonly projects: string;
  readonly error: string | null;
}

const EMPTY_FORM: FormState = {
  name: '',
  mode: 'hourly',
  rate: '',
  currency: 'EUR',
  projects: '',
  error: null,
};

interface FieldHandlers {
  readonly form: FormState;
  readonly patch: (change: Partial<FormState>) => void;
}

/** The form that adds a client (HEU-F-07): real labels, real error messages. */
function ClientForm(): JSX.Element {
  const dispatch = useDispatch();
  const { t } = useI18n();
  const text = useText(EXTRA);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const patch = (change: Partial<FormState>) => setForm((current) => ({ ...current, ...change }));

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const cents = parseCents(form.rate);
    if (form.name.trim().length === 0) return patch({ error: text('clients.nameRequired') });
    if (cents === null) return patch({ error: text('clients.rateRequired') });
    dispatch({ type: 'upsertClient', client: toClient(form, cents) });
    setForm(EMPTY_FORM);
  }

  return (
    <form className="client-form" onSubmit={submit} aria-label={t('clients.add')}>
      <h3>{t('clients.add')}</h3>
      <IdentityFields form={form} patch={patch} />
      <TermsFields form={form} patch={patch} />
      {form.error === null ? null : (
        <p id="client-error" role="alert" className="form-error">
          {form.error}
        </p>
      )}
      <button type="submit" className="primary">
        {t('clients.add')}
      </button>
    </form>
  );
}

/** Name and billing mode of the new client. */
function IdentityFields(props: FieldHandlers): JSX.Element {
  const { t } = useI18n();
  const { form, patch } = props;
  return (
    <>
      <TextField
        id="client-name"
        label={t('clients.name')}
        value={form.name}
        error={form.error}
        onChange={(value) => patch({ name: value })}
        required
      />
      <SelectField
        id="client-mode"
        label={t('clients.mode')}
        value={form.mode}
        onChange={(value) => patch({ mode: value as BillingMode })}
        options={[
          { value: 'hourly', label: t('clients.modeHourly') },
          { value: 'daily-thresholds', label: t('clients.modeDailyThresholds') },
          { value: 'daily-proportional', label: t('clients.modeDailyProportional') },
        ]}
      />
    </>
  );
}

/** Rate, currency and projects of the new client. */
function TermsFields(props: FieldHandlers): JSX.Element {
  const { t } = useI18n();
  const text = useText(EXTRA);
  const { form, patch } = props;
  return (
    <>
      <TextField
        id="client-rate"
        label={t('clients.rate')}
        value={form.rate}
        error={form.error}
        onChange={(value) => patch({ rate: value })}
        type="number"
        min="0"
        step="0.01"
      />
      <TextField
        id="client-currency"
        label={t('clients.currency')}
        value={form.currency}
        onChange={(value) => patch({ currency: value })}
      />
      <TextField
        id="client-projects"
        label={text('clients.projects')}
        hint={text('clients.projectsHint')}
        value={form.projects}
        onChange={(value) => patch({ projects: value })}
      />
    </>
  );
}

function toClient(form: FormState, rateCents: number): Client {
  const currency = form.currency.trim();
  return makeClient({
    name: form.name,
    mode: form.mode,
    rateCents,
    currency: currency.length === 0 ? 'EUR' : currency,
    projects: toProjects(form.projects),
  });
}

/** `acme-api, northwind-portal` → the two projects, ids derived by the factory. */
function toProjects(raw: string): readonly { readonly name: string }[] {
  return raw
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .map((name) => ({ name }));
}

/** `65,50` → `6550` cents; `null` when the field is not a positive amount. */
function parseCents(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  if (cleaned.length === 0) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

interface TextFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly hint?: string;
  readonly error?: string | null;
  readonly type?: string;
  readonly min?: string;
  readonly step?: string;
  readonly required?: boolean;
}

/**
 * A labelled field. Its hint and its error are wired through
 * `aria-describedby`, and an invalid field says so with `aria-invalid`.
 */
function TextField(props: TextFieldProps): JSX.Element {
  const ids: string[] = [];
  if (props.hint !== undefined) ids.push(`${props.id}-hint`);
  if (props.error != null) ids.push('client-error');
  return (
    <div className="form-field">
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        name={props.id}
        type={props.type ?? 'text'}
        min={props.min}
        step={props.step}
        value={props.value}
        required={props.required ?? false}
        aria-describedby={ids.length === 0 ? undefined : ids.join(' ')}
        aria-invalid={props.error != null}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.hint === undefined ? null : (
        <span id={`${props.id}-hint`} className="form-hint">
          {props.hint}
        </span>
      )}
    </div>
  );
}

/** A labelled `<select>`. */
function SelectField(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}): JSX.Element {
  return (
    <div className="form-field">
      <label htmlFor={props.id}>{props.label}</label>
      <select id={props.id} name={props.id} value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
