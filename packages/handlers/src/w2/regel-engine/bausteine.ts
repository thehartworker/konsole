// Baustein-Registry: benannte, wiederverwendbare deterministische
// Prüf-Funktionen für Stage 3. Der Code liefert die Bibliothek der
// verfügbaren Bausteine, aber NICHT welche für einen Kunden aktiv sind --
// das steuert die pruefregeln-Zeile (typ = 'code_baustein', baustein_name).
// Siehe docs/decisions/2026-07-12_w2-presseanfragen-drafter.md, Tabelle im
// Abschnitt "Zu 3".

import { istWahrscheinlichDeutsch } from '../sprache.js';
import type { CommsPlanDraft } from '../schema.js';

export interface BausteinKontext {
  sprachregelungVorhanden: boolean;
  fristAt: string | null;
}

export type BausteinErgebnis = { bestanden: true } | { bestanden: false; begruendung: string };

export type BausteinFn = (
  draft: CommsPlanDraft,
  kontext: BausteinKontext,
  parameter: Record<string, unknown>,
) => BausteinErgebnis;

function alleTextfelder(draft: CommsPlanDraft): string {
  return [
    draft.what_were_doing,
    draft.strategic_objectives.reputation,
    draft.strategic_objectives.risk,
    draft.reactive_statement ?? '',
    ...draft.background_information.flatMap((b) => [b.content, b.strategy_note]),
    ...draft.open_questions,
  ].join('\n');
}

function nichtOpenQuestionsTextfelder(draft: CommsPlanDraft): string {
  return [
    draft.what_were_doing,
    draft.strategic_objectives.reputation,
    draft.strategic_objectives.risk,
    draft.reactive_statement ?? '',
    ...draft.background_information.flatMap((b) => [b.content, b.strategy_note]),
  ].join('\n');
}

function formatiereDeutschesDatum(iso: string): string {
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return iso;
  const tag = String(datum.getUTCDate()).padStart(2, '0');
  const monat = String(datum.getUTCMonth() + 1).padStart(2, '0');
  const jahr = datum.getUTCFullYear();
  return `${tag}.${monat}.${jahr}`;
}

const was_wir_tun_zielsprache: BausteinFn = (draft, _kontext, parameter) => {
  const sprache = typeof parameter.sprache === 'string' ? parameter.sprache : 'de';
  if (sprache !== 'de') return { bestanden: true }; // v1: nur die deutsche Ziel-Sprache ist geprüft
  if (istWahrscheinlichDeutsch(draft.what_were_doing)) return { bestanden: true };
  return {
    bestanden: false,
    begruendung: 'what_were_doing wirkt nicht auf Deutsch, interne Comms-Plan-Felder müssen aber immer Deutsch sein.',
  };
};

const reactive_statement_nur_bei_sprachregelung: BausteinFn = (draft, kontext) => {
  if (kontext.sprachregelungVorhanden) return { bestanden: true };
  if (draft.reactive_statement === null) return { bestanden: true };
  return {
    bestanden: false,
    begruendung: 'reactive_statement ist befüllt, obwohl keine Sprachregelung hinterlegt ist (muss null bleiben).',
  };
};

const TIER_MUSTER = /\btier[\s-]?[123]\b/i;

const keine_tier_nennung: BausteinFn = (draft) => {
  if (!TIER_MUSTER.test(alleTextfelder(draft))) return { bestanden: true };
  return { bestanden: false, begruendung: 'Eine Tier-1/2/3-Medien-Einstufung wird im Klartext genannt.' };
};

const AGENTUR_VERMITTLUNGS_MUSTER = [
  /unsere agentur/i,
  /wir als agentur/i,
  /(haben|hat|wurde) .*an .* weitergeleitet/i,
  /im auftrag der agentur/i,
];

const keine_agentur_vermittlungs_bezug: BausteinFn = (draft) => {
  const text = alleTextfelder(draft);
  const treffer = AGENTUR_VERMITTLUNGS_MUSTER.find((muster) => muster.test(text));
  if (!treffer) return { bestanden: true };
  return {
    bestanden: false,
    begruendung: `Ein Verweis auf die eigene Vermittlungsrolle der Agentur wurde gefunden (Muster: ${treffer.source}).`,
  };
};

const PROZESS_ERKLAERUNGS_MUSTER = [
  /unser(en)? freigabeprozess/i,
  /intern (noch )?abgestimmt/i,
  /muss noch (intern )?geprüft werden/i,
  /das ist unser standard-workflow/i,
];

const keine_prozess_erklaerungen: BausteinFn = (draft) => {
  const text = alleTextfelder(draft);
  const treffer = PROZESS_ERKLAERUNGS_MUSTER.find((muster) => muster.test(text));
  if (!treffer) return { bestanden: true };
  return {
    bestanden: false,
    begruendung: `Eine Erklärung interner Agentur-Prozesse wurde gefunden (Muster: ${treffer.source}).`,
  };
};

const ACTION_ITEM_MUSTER = [/\btodo\b/i, /action item/im, /^\s*-\s*\[\s*\]/m];

const action_items_nur_in_open_questions: BausteinFn = (draft) => {
  const text = nichtOpenQuestionsTextfelder(draft);
  const treffer = ACTION_ITEM_MUSTER.find((muster) => muster.test(text));
  if (!treffer) return { bestanden: true };
  return {
    bestanden: false,
    begruendung: 'Ein Action-Item-Marker wurde außerhalb von open_questions gefunden.',
  };
};

const background_mit_quellenangabe: BausteinFn = (draft) => {
  const ohneQuelle = draft.background_information.find(
    (eintrag) => eintrag.sources.length === 0 || eintrag.sources.every((s) => s.trim().length === 0),
  );
  if (!ohneQuelle) return { bestanden: true };
  return {
    bestanden: false,
    begruendung: `background_information-Eintrag "${ohneQuelle.topic_field}" hat keine Quellenangabe.`,
  };
};

const deadline_schlusssatz_bei_frist: BausteinFn = (draft, kontext) => {
  if (!kontext.fristAt) return { bestanden: true }; // Regel nur relevant bei expliziter Frist
  const erwartetesDatum = formatiereDeutschesDatum(kontext.fristAt);
  const relevanterText = [draft.reactive_statement ?? '', ...draft.open_questions].join('\n');
  if (relevanterText.includes(erwartetesDatum)) return { bestanden: true };
  return {
    bestanden: false,
    begruendung: `Bei expliziter Frist fehlt der standardisierte Deadline-Hinweis "bis ${erwartetesDatum}" in reactive_statement oder open_questions.`,
  };
};

export const BAUSTEIN_REGISTRY: Record<string, BausteinFn> = {
  was_wir_tun_zielsprache,
  reactive_statement_nur_bei_sprachregelung,
  keine_tier_nennung,
  keine_agentur_vermittlungs_bezug,
  keine_prozess_erklaerungen,
  action_items_nur_in_open_questions,
  background_mit_quellenangabe,
  deadline_schlusssatz_bei_frist,
};

export const BAUSTEIN_NAMEN = Object.keys(BAUSTEIN_REGISTRY);
