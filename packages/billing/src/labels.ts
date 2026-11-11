import type { SupportedLocale } from '@ghost-hours/core';

/**
 * Every word the draft, the annex and the exports print (HEU-N-05).
 *
 * English is the submission language, French is the second dictionary. Unit
 * symbols (`h`, `day`) are *not* translated: a unit is not prose, and the
 * invoice machine-reader expects one spelling. `Draft` is likewise a fixed
 * term — HEU-F-25 asks for that exact word on the document, in both languages.
 */
export interface Labels {
  readonly draftBadge: string;
  readonly draftTitle: string;
  readonly noNumber: string;
  readonly billTo: string;
  readonly period: string;
  readonly project: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly amount: string;
  readonly subtotal: string;
  readonly taxRate: string;
  readonly tax: string;
  readonly total: string;
  readonly rounding: string;
  readonly notes: string;
  readonly annexTitle: string;
  readonly day: string;
  readonly minutes: string;
  readonly hours: string;
  readonly commits: string;
  readonly meetings: string;
  readonly totalRow: string;
  readonly unassigned: string;
  readonly client: string;
  readonly start: string;
  readonly end: string;
  readonly confidence: string;
  readonly provenShare: string;
  readonly evidence: string;
}

const EN: Labels = {
  draftBadge: 'Draft',
  draftTitle: 'Draft invoice',
  noNumber: 'No invoice number: this document is a draft.',
  billTo: 'Bill to',
  period: 'Period',
  project: 'Project',
  quantity: 'Quantity',
  unitPrice: 'Unit price',
  amount: 'Amount',
  subtotal: 'Subtotal',
  taxRate: 'Tax rate',
  tax: 'Tax',
  total: 'Total',
  rounding: 'Rounding',
  notes: 'Notes',
  annexTitle: 'Evidence annex',
  day: 'Day',
  minutes: 'Minutes',
  hours: 'Hours',
  commits: 'Commits',
  meetings: 'Meetings',
  totalRow: 'Total',
  unassigned: 'Unassigned',
  client: 'Client',
  start: 'Start',
  end: 'End',
  confidence: 'Confidence',
  provenShare: 'Proven share',
  evidence: 'Evidence',
};

const FR: Labels = {
  draftBadge: 'Draft',
  draftTitle: 'Facture en brouillon — Draft',
  noNumber: 'Aucun numéro de facture : ce document est un brouillon.',
  billTo: 'Facturé à',
  period: 'Période',
  project: 'Projet',
  quantity: 'Quantité',
  unitPrice: 'Prix unitaire',
  amount: 'Montant',
  subtotal: 'Total hors taxes',
  taxRate: "Taux de taxe",
  tax: 'Taxe',
  total: 'Total',
  rounding: 'Arrondi',
  notes: 'Mentions',
  annexTitle: 'Annexe de preuves',
  day: 'Jour',
  minutes: 'Minutes',
  hours: 'Heures',
  commits: 'Commits',
  meetings: 'Réunions',
  totalRow: 'Total',
  unassigned: 'Non affecté',
  client: 'Client',
  start: 'Début',
  end: 'Fin',
  confidence: 'Confiance',
  provenShare: 'Part prouvée',
  evidence: 'Preuves',
};

export function labels(locale: SupportedLocale): Labels {
  return locale === 'fr' ? FR : EN;
}
