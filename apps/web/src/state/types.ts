import type {
  AnnexDetail,
  Block,
  Client,
  Conflict,
  Evidence,
  Instant,
  MappingRule,
  ReconstructionSettings,
  SupportedLocale,
} from '@ghost-hours/core';
import type { Calibration, LeadInCorrection } from '@ghost-hours/sessionizer';
import type { NoteFile } from '@ghost-hours/notes';
import type { Dataset } from '@ghost-hours/core';

/**
 * The application state (contract 3).
 *
 * Everything the app knows lives here: the evidence that was imported, the
 * clients and their rules, the reconstructed blocks and the review decisions
 * the user made. Nothing else is stored anywhere but the browser.
 */
export interface AppState {
  readonly status: 'empty' | 'ready';
  readonly locale: SupportedLocale;
  readonly settings: ReconstructionSettings;
  readonly clients: readonly Client[];
  /** Mapped and orphan evidence alike. */
  readonly evidence: readonly Evidence[];
  readonly blocks: readonly Block[];
  readonly conflicts: readonly Conflict[];
  readonly orphanEvidence: readonly Evidence[];
  /** clientId → minutes declared by the user; `null` when not declared. */
  readonly declaredMinutes: Readonly<Record<string, number | null>>;
  readonly invoicedPeriods: readonly { clientId: string; start: number; end: number }[];
  readonly corrections: readonly LeadInCorrection[];
  readonly activeMonth: { readonly year: number; readonly month: number };
  readonly activeWeekStart: Instant | null;
  readonly selectedBlockId: string | null;
  readonly taxRateBp: number;
  readonly freeTextNotes: readonly string[];
  readonly annexDetail: AnnexDetail;
  /** What was read, what was skipped. */
  readonly importReport: readonly string[];
  /** Lead-in calibration proposal (HEU-F-17); null until there are ten corrections. */
  readonly calibration: Calibration | null;
}

export type AppAction =
  | { type: 'loadSampleMonth' }
  | { type: 'importEvidence'; evidence: readonly Evidence[] }
  | { type: 'importCalendar'; ics: string }
  | { type: 'importNotes'; notes: readonly NoteFile[] }
  | { type: 'addManualBlock'; start: Instant; end: Instant; clientId: string }
  | { type: 'reconstruct' }
  | { type: 'confirmBlock'; blockId: string }
  | { type: 'rejectBlock'; blockId: string }
  | { type: 'adjustBlock'; blockId: string; start: Instant; end: Instant }
  | { type: 'splitBlock'; blockId: string; at: Instant }
  | { type: 'changeClient'; blockId: string; clientId: string; projectId: string | null }
  | { type: 'resolveConflict'; conflictId: string; keepBlockId: string }
  | { type: 'confirmDay'; dayKey: string }
  | { type: 'confirmWeek'; weekStart: Instant }
  | { type: 'upsertClient'; client: Client }
  | { type: 'upsertRule'; rule: MappingRule }
  | { type: 'removeRule'; ruleId: string }
  | { type: 'setSettings'; patch: Partial<ReconstructionSettings> }
  | { type: 'setLocale'; locale: SupportedLocale }
  | { type: 'setDeclared'; clientId: string; minutes: number | null }
  | { type: 'setTaxRate'; basisPoints: number }
  | { type: 'setNotes'; notes: readonly string[] }
  | { type: 'setAnnexDetail'; detail: AnnexDetail }
  | { type: 'setActiveMonth'; year: number; month: number }
  | { type: 'setActiveWeek'; weekStart: Instant }
  | { type: 'selectBlock'; blockId: string | null }
  | { type: 'markPeriodInvoiced'; clientId: string; start: Instant; end: Instant }
  | { type: 'importDataset'; dataset: Dataset }
  | { type: 'resetAll' };

/**
 * The contest month (November 2026). The app starts there so the empty state
 * and the demo always talk about the same month; importing real evidence
 * moves it to the month the evidence belongs to.
 */
export const DEFAULT_ACTIVE_MONTH: { readonly year: number; readonly month: number } = {
  year: 2026,
  month: 11,
};

export function initialState(settings: ReconstructionSettings): AppState {
  return {
    status: 'empty',
    locale: 'en',
    settings,
    clients: [],
    evidence: [],
    blocks: [],
    conflicts: [],
    orphanEvidence: [],
    declaredMinutes: {},
    invoicedPeriods: [],
    corrections: [],
    activeMonth: DEFAULT_ACTIVE_MONTH,
    activeWeekStart: null,
    selectedBlockId: null,
    taxRateBp: 0,
    freeTextNotes: [],
    annexDetail: 'durations',
    importReport: [],
    calibration: null,
  };
}
