export type {
  W1BriefingInput,
  W1GesammelterKontext,
  W1Input,
  W1KontextQuellenProvider,
  W1KundeKontextInput,
  W1LaengeZiel,
  W1PraezedenzEintrag,
  W1SprecherEintrag,
  W1TonalitaetEintrag,
} from './types.js';

// sammleKontext wird als sammleW1Kontext re-exportiert (statt sammleKontext):
// packages/handlers/src/index.ts exportiert w1/index.js und w2/index.js
// gemeinsam per `export *`, beide Module haben intern eine gleichnamige
// Stage-1-Funktion (Konvention, siehe w2/kontext.ts) -- ohne Umbenennung
// wäre der Name am Paket-Root mehrdeutig. Innerhalb von packages/handlers
// (Handler-Code, Tests) bleibt der Import über den direkten Modul-Pfad
// ('./w1/kontext.js') unverändert `sammleKontext`.
export { LeererW1KontextQuellenProvider, sammleKontext as sammleW1Kontext } from './kontext.js';

export { buildDrafterPrompt, type W1Prompt } from './prompt.js';

export {
  erzeugePressemitteilungDraft,
  DEFAULT_MAX_TOKENS_W1_DRAFT,
  DEFAULT_MODELL_W1_DRAFT,
  type PressemitteilungDraftOptionen,
  type PressemitteilungDraftResultat,
} from './draft.js';

export {
  erzeugeKritikerBefund,
  DEFAULT_MAX_TOKENS_W1_KRITIKER,
  DEFAULT_MODELL_W1_KRITIKER,
  type KritikerOptionen,
  type KritikerResultat,
} from './kritiker.js';

export { pruefeDeterministischeGrenzen } from './grenzen.js';

export {
  GrenzPruefungsErgebnisSchema,
  KritikerFindingSchema,
  PressemitteilungSchema,
  W1OutputSchema,
  ZitatSchema,
  type KritikerFinding,
  type PressemitteilungDraft,
  type W1Output,
} from './schema.js';

export {
  fuehreW1Aus,
  W1_HANDLER_SLUG,
  type W1HandlerOptionen,
  type W1HandlerResultat,
  type W1LlmAufruf,
} from './handler.js';
