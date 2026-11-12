import { useState } from 'react';
import type { FormEvent } from 'react';
import type { MappingRule, RuleType } from '@ghost-hours/core';
import { DEFAULT_PRECEDENCE, ruleIdentity } from '@ghost-hours/mapping';
import { useDispatch } from '../state/store.tsx';
import { useI18n } from '../i18n/index.ts';
import type { MessageKey } from '../i18n/index.ts';

/**
 * The rule form (HEU-F-08): write a mapping rule for one client by hand.
 *
 * Until now a rule could only be born from a suggestion on an orphan proof.
 * This form picks a type — listed in the documented order of
 * `DEFAULT_PRECEDENCE` — types its value, and dispatches `upsertRule` with a
 * rule whose id comes from `ruleIdentity`: the same type and value always
 * give the same rule, whoever writes it.
 */

/** The word of each rule type, in one place — the form and the rule list share it. */
export const RULE_KEYS: Readonly<Record<RuleType, MessageKey>> = {
  repo: 'rule.repo',
  'remote-contains': 'rule.remote-contains',
  'attendee-domain': 'rule.attendee-domain',
  'title-contains': 'rule.title-contains',
  'note-tag': 'rule.note-tag',
  manual: 'rule.manual',
};

/** The rule the form writes: value trimmed, id derived; `null` when empty. */
function toRule(clientId: string, type: RuleType, value: string): MappingRule | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return {
    id: ruleIdentity(clientId, type, trimmed),
    clientId,
    type,
    value: trimmed,
    projectId: null,
  };
}

export function RuleForm(props: { readonly clientId: string }): JSX.Element {
  const dispatch = useDispatch();
  const { t } = useI18n();
  const [type, setType] = useState<RuleType>('repo');
  const [value, setValue] = useState('');

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const rule = toRule(props.clientId, type, value);
    if (rule === null) return;
    dispatch({ type: 'upsertRule', rule });
    setValue('');
  }

  return (
    <form className="rule-form" onSubmit={submit} aria-label={t('clients.addRule')}>
      <div className="form-field">
        <label htmlFor={`rule-type-${props.clientId}`}>{t('clients.ruleType')}</label>
        <select
          id={`rule-type-${props.clientId}`}
          value={type}
          onChange={(event) => setType(event.target.value as RuleType)}
        >
          {DEFAULT_PRECEDENCE.map((ruleType) => (
            <option key={ruleType} value={ruleType}>
              {t(RULE_KEYS[ruleType])}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor={`rule-value-${props.clientId}`}>{t('clients.ruleValue')}</label>
        <input
          id={`rule-value-${props.clientId}`}
          value={value}
          required
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      <button type="submit">{t('clients.addRule')}</button>
    </form>
  );
}
