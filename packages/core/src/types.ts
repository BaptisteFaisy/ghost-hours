/**
 * Domain vocabulary of Ghost Hours.
 *
 * Two hard rules drive every type below (see `.kiro/steering/time.md` and
 * `.kiro/steering/prudence.md`):
 *
 * 1. Every point in time is an **instant**: epoch milliseconds, UTC based.
 *    Local wall-clock values never travel through the domain layer; a time
 *    zone is always an explicit parameter at the boundary.
 * 2. Every quantity of work is either **proven** or **assumed**. The two are
 *    never merged silently: a block carries `assumedLeadInMinutes` and
 *    `provenShare` so the UI can draw the difference.
 */

/** Epoch milliseconds (UTC). The only time representation in the domain. */
export type Instant = number;

/** A duration in whole minutes. Settings, rounding and billing speak minutes. */
export type Minutes = number;

/** Money is an integer number of cents. Never a float (HEU-P-09). */
export type Cents = number;

/** Basis points: 1 bp = 0.01 %. A 20 % tax rate is 2000 bp. */
export type BasisPoints = number;

export type EvidenceSource = 'git' | 'calendar' | 'note' | 'manual';

export type EvidenceKind = 'commit' | 'checkout' | 'meeting' | 'note' | 'manual';

/** Status of a calendar event, as read from the `.ics` `STATUS` property. */
export type MeetingStatus = 'confirmed' | 'tentative' | 'cancelled';

/** Participant response, as read from the `.ics` `ATTENDEE` `PARTSTAT`. */
export type AttendeePartStat = 'accepted' | 'declined' | 'tentative' | 'needs-action';

export interface Attendee {
  readonly email: string;
  readonly partStat: AttendeePartStat;
}

/**
 * A single piece of proof. Points (`commit`, `checkout`, `note`) carry `at`;
 * spans (`meeting`, `manual`) carry `start` and `end`.
 */
export interface Evidence {
  /** Stable identifier; re-importing the same evidence must reuse it (HEU-F-06). */
  readonly id: string;
  readonly source: EvidenceSource;
  readonly kind: EvidenceKind;
  /** Client the evidence is mapped to, or `null` when still orphan (HEU-F-09). */
  readonly clientId: string | null;
  /** Project inside the client, when a rule resolves it. */
  readonly projectId?: string | null;
  /** Start instant for point evidence; equal to `end` when absent. */
  readonly at?: Instant;
  readonly start?: Instant;
  readonly end?: Instant;
  /** Git fields. */
  readonly repo?: string;
  readonly remote?: string;
  readonly branch?: string;
  readonly summary?: string;
  readonly added?: number;
  readonly deleted?: number;
  readonly authorEmail?: string;
  /** Reflog `checkout` target branch. */
  readonly to?: string;
  readonly from?: string;
  /** Calendar fields. */
  readonly title?: string;
  readonly attendees?: readonly Attendee[];
  readonly organizerEmail?: string;
  readonly status?: MeetingStatus;
  readonly allDay?: boolean;
  readonly recurring?: boolean;
  readonly timeZone?: string;
  /** Note fields. */
  readonly file?: string;
  readonly line?: number;
  readonly text?: string;
  readonly tag?: string;
  /** Anything the reader kept verbatim, for the evidence panel. */
  readonly raw?: Record<string, unknown>;
}

export type BillingMode = 'hourly' | 'daily-thresholds' | 'daily-proportional';

export type RoundingMode = 'none' | 'nearest' | 'up';

/** Where the rounding rule is applied (HEU-F-23). */
export type RoundingScope = 'session' | 'day' | 'total';

export interface RoundingRule {
  readonly mode: RoundingMode;
  readonly stepMinutes: Minutes;
  readonly scope: RoundingScope;
}

export type RuleType =
  | 'repo'
  | 'remote-contains'
  | 'attendee-domain'
  | 'title-contains'
  | 'note-tag'
  | 'manual';

/** One association rule: this evidence belongs to that client (HEU-F-08). */
export interface MappingRule {
  readonly id: string;
  readonly clientId: string;
  readonly type: RuleType;
  /** Repository name, remote fragment, domain, title fragment or note tag. */
  readonly value: string;
  readonly projectId?: string | null;
}

export interface Project {
  readonly id: string;
  readonly name: string;
}

export interface Client {
  readonly id: string;
  readonly name: string;
  readonly mode: BillingMode;
  /** Hourly rate in cents, used by `hourly` mode. */
  readonly rateCents: Cents;
  /** Daily rate in cents, used by both daily modes. */
  readonly dayRateCents: Cents;
  readonly currency: string;
  readonly rounding: RoundingRule;
  readonly projects: readonly Project[];
  readonly rules: readonly MappingRule[];
}

export type BlockStatus = 'proposed' | 'confirmed' | 'rejected' | 'conflict' | 'locked';

export type BlockOrigin = 'git-session' | 'meeting' | 'merged' | 'manual';

/**
 * The decision behind a block's bounds (spec D.5, steps 4 to 8). Structured
 * rather than a sentence: the wording belongs to the interface, the facts
 * belong to the domain.
 */
export type BlockReason =
  | { readonly kind: 'checkout'; readonly repo: string; readonly minutes: number }
  | { readonly kind: 'assumed'; readonly minutes: number;
      readonly boundedBy: 'previous-proof' | 'workday-start' | 'none' }
  | { readonly kind: 'resume'; readonly pauseMinutes: number }
  | { readonly kind: 'meeting' }
  | { readonly kind: 'manual' }
  | { readonly kind: 'merged'; readonly count: number }
  | { readonly kind: 'trimmed'; readonly byClient: string }
  | { readonly kind: 'conflict'; readonly withClient: string };

export type ConfidenceLevel = 'solid' | 'likely' | 'to-confirm';

/** A chunk of time attributed to one client, proposed or decided by the user. */
export interface Block {
  readonly id: string;
  readonly start: Instant;
  readonly end: Instant;
  readonly clientId: string;
  readonly projectId: string | null;
  readonly status: BlockStatus;
  readonly origin: BlockOrigin;
  /** Share of the block covered by hard evidence, in [0, 1] (HEU-F-15). */
  readonly provenShare: number;
  readonly confidence: ConfidenceLevel;
  /** Assumed lead-in, drawn lighter than the proven part (prudence). */
  readonly assumedLeadInMinutes: Minutes;
  readonly evidenceIds: readonly string[];
  /** Locked blocks survive every new reconstruction (HEU-F-29, HEU-P-13). */
  readonly locked: boolean;
  /** User edited the bounds by hand: do not re-derive them. */
  readonly adjusted: boolean;
  readonly note?: string;
  /**
   * Why the block starts and ends where it does, so the reviewer checks the
   * machine's reasoning instead of trusting it.
   */
  readonly reason?: BlockReason;
}

/** Contradictory evidence: two clients claim the same minutes (HEU-F-14). */
export interface Conflict {
  readonly id: string;
  readonly start: Instant;
  readonly end: Instant;
  readonly blockIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly reason: string;
  readonly resolved: boolean;
}

export interface Period {
  readonly start: Instant;
  readonly end: Instant;
}

export interface InvoiceLine {
  readonly projectId: string | null;
  readonly label: string;
  /** Minutes for `hourly`, thousandths of a day for the daily modes. */
  readonly quantityMinutes: Minutes;
  readonly unitLabel: string;
  readonly unitPriceCents: Cents;
  readonly amountCents: Cents;
  readonly evidenceCount: number;
}

export interface InvoiceDraft {
  readonly clientId: string;
  readonly clientName: string;
  readonly period: Period;
  readonly mode: BillingMode;
  readonly lines: readonly InvoiceLine[];
  readonly roundingRule: RoundingRule;
  readonly roundingNote: string;
  readonly subtotalCents: Cents;
  readonly taxRateBp: BasisPoints;
  readonly taxCents: Cents;
  readonly totalCents: Cents;
  readonly currency: string;
  readonly freeTextNotes: readonly string[];
  /** Always present, never a number: this is a draft (HEU-F-25). */
  readonly draftLabel: 'Draft';
}

/** Per-day evidence annex attached to a draft (HEU-F-26). */
export interface AnnexDay {
  readonly dayKey: string;
  readonly minutes: Minutes;
  readonly commitCount: number;
  readonly meetingTitles: readonly string[];
}

export type AnnexDetail = 'durations' | 'with-evidence';

export interface MonthCounter {
  readonly clientId: string | null;
  readonly period: Period;
  readonly foundMinutes: Minutes;
  readonly confirmedMinutes: Minutes;
  readonly declaredMinutes: Minutes | null;
  readonly ghostMinutes: Minutes | null;
  readonly ghostAmountCents: Cents | null;
}

/** Result of one reconstruction pass (HEU-F-16: deterministic). */
export interface ReconstructionResult {
  readonly blocks: readonly Block[];
  readonly conflicts: readonly Conflict[];
  readonly orphanEvidence: readonly Evidence[];
  /**
   * Evidence deliberately set aside (automation commits, and anything too
   * short to propose). Listed, never silently dropped.
   */
  readonly ignoredEvidence?: readonly Evidence[];
  readonly settings: ReconstructionSettings;
}

export interface ReconstructionSettings {
  readonly gapMaxMinutes: Minutes;
  /**
   * A pause inside a working day (lunch, a call): past this gap the session is
   * cut, but **without** an assumed lead-in — a pause is not work, so nothing
   * is invented before the work resumes. Must stay below `gapMaxMinutes`.
   */
  readonly breakMaxMinutes: Minutes;
  /** Drop commits produced by automation (bots, merge queues) and list them. */
  readonly ignoreAutomation: boolean;
  readonly leadInDefaultMinutes: Minutes;
  readonly leadInMaxMinutes: Minutes;
  readonly minSessionMinutes: Minutes;
  /** Wall-clock floor for an assumed lead-in, `HH:MM` in `timeZone`. */
  readonly workdayStart: string;
  readonly tailMinutes: Minutes;
  readonly timeZone: string;
  readonly dayLengthMinutes: Minutes;
  readonly fullDayFromMinutes: Minutes;
  readonly halfDayFromMinutes: Minutes;
}

export type SupportedLocale = 'en' | 'fr';
