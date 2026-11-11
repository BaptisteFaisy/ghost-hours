import { createContext, createElement, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  formatDate as coreFormatDate,
  formatDayLabel,
  formatMinutes,
  formatMoney as coreFormatMoney,
  formatTime as coreFormatTime,
} from '@ghost-hours/core';
import type { Cents, Instant, Minutes, SupportedLocale } from '@ghost-hours/core';
import { en } from './en.ts';
import type { MessageKey } from './en.ts';
import { fr } from './fr.ts';
import { useApp, useDispatch } from '../state/store.tsx';

/**
 * The i18n layer (HEU-N-05): no external library, English by default, French
 * available, and the switch happens without a reload.
 *
 * The locale lives in the application store, so the language is persisted with
 * the rest of the data and shared by every screen.
 */
export interface I18nApi {
  /** Translate a key; `{placeholders}` are replaced by `values`. */
  t: (key: MessageKey, values?: Readonly<Record<string, string | number>>) => string;
  readonly locale: SupportedLocale;
  readonly setLocale: (locale: SupportedLocale) => void;
  readonly formatDate: (instant: Instant) => string;
  readonly formatTime: (instant: Instant) => string;
  readonly formatMoney: (cents: Cents, currency?: string) => string;
  readonly formatDuration: (minutes: Minutes) => string;
  readonly formatDay: (dayKey: string) => string;
}

const DICTIONARIES: Readonly<Record<SupportedLocale, Readonly<Record<MessageKey, string>>>> = {
  en,
  fr,
};

const I18nContext = createContext<I18nApi | null>(null);

function interpolate(template: string, values?: Readonly<Record<string, string | number>>): string {
  if (values === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

function translator(locale: SupportedLocale) {
  const dictionary = DICTIONARIES[locale];
  return (key: MessageKey, values?: Readonly<Record<string, string | number>>): string => {
    const template = dictionary[key] ?? en[key] ?? key;
    return interpolate(template, values);
  };
}

export function I18nProvider(props: { children: ReactNode }): JSX.Element {
  const { locale, settings } = useApp();
  const dispatch = useDispatch();
  const t = useMemo(() => translator(locale), [locale]);
  const setLocale = useCallback(
    (next: SupportedLocale) => {
      dispatch({ type: 'setLocale', locale: next });
    },
    [dispatch],
  );
  const api = useMemo<I18nApi>(
    () => ({
      t,
      locale,
      setLocale,
      formatDate: (instant) => coreFormatDate(instant, settings.timeZone, locale),
      formatTime: (instant) => coreFormatTime(instant, settings.timeZone, locale),
      formatMoney: (cents, currency = 'EUR') => coreFormatMoney(cents, currency, locale),
      formatDuration: (minutes) => formatMinutes(minutes),
      formatDay: (dayKey) => formatDayLabel(dayKey, locale),
    }),
    [locale, setLocale, t, settings.timeZone],
  );
  return createElement(I18nContext.Provider, { value: api }, props.children);
}

/** The translation helpers of the current locale. */
export function useI18n(): I18nApi {
  const api = useContext(I18nContext);
  if (api === null) throw new Error('useI18n must be used inside an I18nProvider');
  return api;
}

export type { MessageKey };
export { en } from './en.ts';
export { fr } from './fr.ts';
