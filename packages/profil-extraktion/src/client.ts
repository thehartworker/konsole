// Client-taugliches Sub-Export von @konsole/profil-extraktion (Aufgabe H.1,
// Post-Merge-Correction zu Issue #50). Re-exportiert NUR Schemas, Types und
// Enums -- explizit NICHT dokument-text-provider.ts/website-text-provider.ts
// (ziehen pdf-parse/mammoth bzw. echte fetch()-Infrastruktur) oder
// extrahiere.ts (LLM-Call). Diese Trennung existiert, weil `src/index.ts`
// alles in einem Barrel re-exportiert: sobald ein Client Component-Modul
// (z. B. apps/web/src/lib/kundenprofil-felder.ts) daraus einen Laufzeit-Wert
// importiert, zieht Webpack den gesamten Barrel inklusive der Server-only-
// Provider in den Client-Bundle-Pfad -- die Provider referenzieren wiederum
// `node:module`, was im Browser-Bundle bricht. Server-Code importiert
// weiterhin aus dem Default-Export ('@konsole/profil-extraktion'), der
// Provider und Client-Teil gemeinsam enthält.

export type {
  ProfilExtraktionsQuelle,
  HochgeladeneDateiTyp,
  HochgeladeneDatei,
  ExtrahierterText,
  KundenWebsiteQuelle,
} from './types.js';

export {
  KUNDEN_PROFIL_GRUNDTON,
  ANREDE_KONVENTION,
  KUNDEN_BOILERPLATE_TYP,
  KUNDEN_GRENZEN_TYP,
  MEDIEN_PRIORITAET,
  ProfilExtraktionsVorschlagSchema,
  type ProfilExtraktionsVorschlag,
  type KennzahlVorschlag,
  type BoilerplateVorschlag,
  type SprecherVorschlag,
  type KernbotschaftVorschlag,
  type ThemaVorschlag,
  type GrenzeVorschlag,
  type MedienKontextVorschlag,
} from './schema.js';
