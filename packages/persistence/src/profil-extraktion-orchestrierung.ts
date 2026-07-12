// Ende-zu-Ende-Orchestrierung der Kundenprofil-KI-Befüllung (Issue #37,
// Ebene 3, PR 2): Dokument hochladen (Referenz in kunden_quelldokumente,
// Datei in Supabase Storage) ODER Website-URL angeben -> Text beschaffen
// (packages/profil-extraktion-Provider) -> KI-Extraktion (Opus, konservativ,
// extrahiereProfilVorschlag) -> abgeleitete Elemente ins Profil schreiben
// (KundenProfilRepository) -- Token-Erfassung PRO tatsächlichem LLM-Call in
// llm_nutzung (handler_slug = 'profil_extraktion'), analog zu
// orchestrierung.ts/w2-orchestrierung.ts: der Call wurde bereits
// abgerechnet, auch wenn die Extraktion danach an Zod scheitert.
//
// unklare_hinweise (Extraktions-Schema) werden hier NICHT persistiert -- es
// gibt in PR 2 keine Zieltabelle/-spalte dafür, sie werden aber im
// Rückgabewert an den Aufrufer durchgereicht, damit sie nicht stillschweigend
// verloren gehen (spätere menschliche Prüfung, Ebene 4).

import {
  extrahiereProfilVorschlag,
  type ExtrahierterText,
  type DokumentTextProvider,
  type HochgeladeneDateiTyp,
  type KundenWebsiteQuelle,
  type ProfilExtraktionsOptionen,
  type ProfilExtraktionsQuelle,
  type ProfilExtraktionsVorschlag,
  type WebsiteTextProvider,
} from '@konsole/profil-extraktion';
import type { LLMProvider } from '@konsole/llm';
import type { KlassifikationsRepository } from './types.js';
import type {
  KundenProfilKernVorschlagsFelder,
  KundenProfilRepository,
  KundenProfilVorschlagResultat,
} from './kundenprofil.js';
import type { KundenQuelldokumenteRepository } from './kunden-quelldokumente.js';

const LLM_NUTZUNG_HANDLER_SLUG_PROFIL_EXTRAKTION = 'profil_extraktion';

export interface ProfilExtraktionErgebnisProText {
  bezeichnung: string;
  status: 'erfolg' | 'fehlgeschlagen';
  fehler?: string;
  eingefuegteListenElemente?: number;
  dublettenUebersprungen?: number;
  verworfeneKennzahlen?: number;
  unklareHinweise?: string[];
}

export interface ExtrahiereUndPersistiereProfilResultat {
  ergebnisseProText: ProfilExtraktionErgebnisProText[];
}

function heutigesStandDatum(): string {
  return new Date().toISOString().slice(0, 10);
}

function kernFelderAusVorschlag(vorschlag: ProfilExtraktionsVorschlag): KundenProfilKernVorschlagsFelder {
  return {
    rechtsform: vorschlag.fakten.rechtsform,
    sitz: vorschlag.fakten.sitz,
    geschaeftsbeschreibung: vorschlag.fakten.geschaeftsbeschreibung,
    grundton: vorschlag.stimme.grundton,
    anrede_konvention: vorschlag.stimme.anrede_konvention,
    gendering_konvention: vorschlag.stimme.gendering_konvention,
    zielsprache_absender_texte: vorschlag.stimme.zielsprache_absender_texte,
    positionierung: vorschlag.strategie.positionierung,
    usp: vorschlag.strategie.usp,
  };
}

async function schreibeListenVorschlaegeInsProfil(
  kundeId: string,
  vorschlag: ProfilExtraktionsVorschlag,
  quelle: ProfilExtraktionsQuelle,
  stand: string,
  kundenProfilRepo: KundenProfilRepository,
): Promise<KundenProfilVorschlagResultat> {
  const ergebnisse = await Promise.all([
    kundenProfilRepo.listenElementeVorschlagen({
      tabelle: 'kunden_boilerplate',
      kundeId,
      zeilen: vorschlag.boilerplate.map((b) => ({ typ: b.typ, sprache: b.sprache, text: b.text, stand })),
      vergleichsSchluessel: (z) => String(z.text ?? ''),
      quelle,
    }),
    kundenProfilRepo.listenElementeVorschlagen({
      tabelle: 'kunden_kennzahlen',
      kundeId,
      // stichtag/quelle sind hier garantiert nicht-null: wendeKonservativesPrinzipAn
      // (packages/profil-extraktion/src/konservativ.ts) hat jede Kennzahl ohne
      // beides bereits verworfen, bevor dieser Code läuft (siehe Decision,
      // "Konservativ-Prinzip").
      zeilen: vorschlag.kennzahlen.map((k) => ({
        bezeichnung: k.bezeichnung,
        wert: k.wert,
        stichtag: k.stichtag as string,
        quelle: k.quelle as string,
      })),
      vergleichsSchluessel: (z) => `${String(z.bezeichnung ?? '')} ${String(z.wert ?? '')}`,
      quelle,
    }),
    kundenProfilRepo.listenElementeVorschlagen({
      tabelle: 'kunden_sprecher',
      kundeId,
      zeilen: vorschlag.sprecher.map((s) => ({
        name: s.name,
        rolle: s.rolle,
        exakte_schreibweise: s.exakte_schreibweise,
        zitat_freigabe: s.zitat_freigabe,
      })),
      vergleichsSchluessel: (z) => String(z.name ?? ''),
      quelle,
    }),
    kundenProfilRepo.listenElementeVorschlagen({
      tabelle: 'kunden_kernbotschaften',
      kundeId,
      zeilen: vorschlag.kernbotschaften.map((k) => ({ text: k.text, reihenfolge: k.reihenfolge })),
      vergleichsSchluessel: (z) => String(z.text ?? ''),
      quelle,
    }),
    kundenProfilRepo.listenElementeVorschlagen({
      tabelle: 'kunden_themen',
      kundeId,
      zeilen: vorschlag.themen.map((t) => ({
        thema: t.thema,
        sprachregelung: t.sprachregelung,
        reaktives_statement: t.reaktives_statement,
        positionierung_vorhanden: t.positionierung_vorhanden,
      })),
      vergleichsSchluessel: (z) => String(z.thema ?? ''),
      quelle,
    }),
    kundenProfilRepo.listenElementeVorschlagen({
      tabelle: 'kunden_grenzen',
      kundeId,
      zeilen: vorschlag.grenzen.map((g) => ({
        typ: g.typ,
        inhalt: g.inhalt,
        textart_geltungsbereich: g.textart_geltungsbereich,
        // Ein KI-Vorschlag darf das Scharf-Schalten NIE selbst aktivieren
        // (siehe Decision, Abschnitt "Konservativ-Prinzip") -- unabhängig
        // davon, was ein künftiges Extraktions-Schema dazu ausgeben könnte.
        ist_deterministisch_erzwungen: false,
      })),
      vergleichsSchluessel: (z) => String(z.inhalt ?? ''),
      quelle,
    }),
    kundenProfilRepo.listenElementeVorschlagen({
      tabelle: 'kunden_medien_kontext',
      kundeId,
      zeilen: vorschlag.medien_kontext.map((m) => ({
        medium_name: m.medium_name,
        journalist_name: m.journalist_name,
        beziehungsnotiz: m.beziehungsnotiz,
        prioritaet: m.prioritaet,
      })),
      vergleichsSchluessel: (z) => `${String(z.medium_name ?? '')} ${String(z.journalist_name ?? '')}`,
      quelle,
    }),
  ]);

  return ergebnisse.reduce<KundenProfilVorschlagResultat>(
    (summe, teil) => ({
      eingefuegt: summe.eingefuegt + teil.eingefuegt,
      dublettenUebersprungen: summe.dublettenUebersprungen + teil.dublettenUebersprungen,
    }),
    { eingefuegt: 0, dublettenUebersprungen: 0 },
  );
}

export interface ExtrahiereUndPersistiereProfilEingabe {
  kundeId: string;
  quelle: ProfilExtraktionsQuelle;
  /** Bereits beschaffte Texte (Dokument-Upload: ein Element, Website-Scraping: mehrere Seiten). */
  texte: ExtrahierterText[];
  provider: LLMProvider;
  repo: KlassifikationsRepository;
  kundenProfilRepo: KundenProfilRepository;
  optionen?: ProfilExtraktionsOptionen;
}

/**
 * Ein Extraktions-Call PRO Text (Design-Entscheidung: "ein llm_nutzung-
 * Eintrag pro Extraktions-Call"). Bei Website-Scraping mit mehreren Seiten
 * bedeutet das mehrere Calls, jeweils mit derselben herkunft='website-
 * scraping', die abgeleiteten Elemente addieren sich additiv im Profil auf
 * (Nicht-Überschreiben-Regel + Dubletten-Vorfilterung greifen pro Call
 * unverändert).
 */
export async function extrahiereUndPersistiereProfil(
  eingabe: ExtrahiereUndPersistiereProfilEingabe,
): Promise<ExtrahiereUndPersistiereProfilResultat> {
  const { kundeId, quelle, texte, provider, repo, kundenProfilRepo, optionen } = eingabe;

  const kunde = await repo.kundeLaden(kundeId);
  if (!kunde) {
    throw new Error(`extrahiereUndPersistiereProfil: kunde ${kundeId} existiert nicht oder ist gelöscht.`);
  }

  const stand = heutigesStandDatum();
  const ergebnisseProText: ProfilExtraktionErgebnisProText[] = [];

  for (const text of texte) {
    const resultat = await extrahiereProfilVorschlag(text.text, quelle, text.bezeichnung, provider, optionen);

    // Jeder tatsächliche LLM-Call bekommt eine llm_nutzung-Zeile, auch bei
    // einem Zod-/JSON-Fehlschlag danach (der Call wurde bereits abgerechnet),
    // gleiches Prinzip wie orchestrierung.ts/w2-orchestrierung.ts.
    if (resultat.tokenVerbrauch) {
      await repo.llmNutzungSchreiben({
        agentur_id: kunde.agentur_id,
        kunde_id: kundeId,
        vorgang_id: null,
        handler_slug: LLM_NUTZUNG_HANDLER_SLUG_PROFIL_EXTRAKTION,
        input_tokens: resultat.tokenVerbrauch.input_tokens,
        output_tokens: resultat.tokenVerbrauch.output_tokens,
        modell: resultat.modell ?? optionen?.model ?? 'unbekannt',
      });
    }

    if (resultat.status === 'fehlgeschlagen') {
      ergebnisseProText.push({ bezeichnung: text.bezeichnung, status: 'fehlgeschlagen', fehler: resultat.fehler });
      continue;
    }

    await kundenProfilRepo.kernFelderVorschlagen(kundeId, kernFelderAusVorschlag(resultat.vorschlag), quelle, stand);
    const listenErgebnis = await schreibeListenVorschlaegeInsProfil(kundeId, resultat.vorschlag, quelle, stand, kundenProfilRepo);

    ergebnisseProText.push({
      bezeichnung: text.bezeichnung,
      status: 'erfolg',
      eingefuegteListenElemente: listenErgebnis.eingefuegt,
      dublettenUebersprungen: listenErgebnis.dublettenUebersprungen,
      verworfeneKennzahlen: resultat.verworfeneKennzahlen,
      unklareHinweise: resultat.vorschlag.unklare_hinweise,
    });
  }

  return { ergebnisseProText };
}

function dateiTypAusMetadaten(mimeTyp: string | null, dateiname: string): HochgeladeneDateiTyp {
  const mime = mimeTyp?.toLowerCase() ?? '';
  const dateiendung = dateiname.toLowerCase().split('.').pop() ?? '';

  if (mime === 'application/pdf' || dateiendung === 'pdf') return 'pdf';
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    dateiendung === 'docx'
  ) {
    return 'docx';
  }
  if (mime === 'text/html' || dateiendung === 'html' || dateiendung === 'htm') return 'html';
  return 'text';
}

export interface VerarbeiteDokumentUndPersistiereProfilEingabe {
  quelldokumentId: string;
  kundeId: string;
  provider: LLMProvider;
  dokumentTextProvider: DokumentTextProvider;
  repo: KlassifikationsRepository;
  kundenProfilRepo: KundenProfilRepository;
  quelldokumenteRepo: KundenQuelldokumenteRepository;
  optionen?: ProfilExtraktionsOptionen;
}

/**
 * Orchestriert den Dokument-Pfad: bereits hochgeladenes Dokument
 * (kunden_quelldokumente-Zeile existiert, Datei liegt in Supabase Storage) ->
 * Bytes laden -> Text extrahieren -> KI-Extraktion -> Profil schreiben ->
 * extraktion_status fortschreiben ('verarbeitet'/'fehlgeschlagen'). Der
 * eigentliche HTTP-Upload (Datei -> Supabase Storage + kunden_quelldokumente-
 * Insert) ist NICHT Teil dieser Funktion -- das ist eine Server-Route
 * (apps/web), die diese Orchestrierung nach einem erfolgreichen Upload
 * aufruft.
 */
export async function verarbeiteDokumentUndPersistiereProfil(
  eingabe: VerarbeiteDokumentUndPersistiereProfilEingabe,
): Promise<ExtrahiereUndPersistiereProfilResultat> {
  const { quelldokumentId, kundeId, provider, dokumentTextProvider, repo, kundenProfilRepo, quelldokumenteRepo, optionen } =
    eingabe;

  const quelldokument = await quelldokumenteRepo.quelldokumentLaden(quelldokumentId);
  if (!quelldokument) {
    throw new Error(`verarbeiteDokumentUndPersistiereProfil: quelldokument ${quelldokumentId} existiert nicht oder ist gelöscht.`);
  }

  let extrahierterText: ExtrahierterText;
  try {
    const inhalt = await quelldokumenteRepo.dateiInhaltLaden(quelldokument.bucket_pfad);
    extrahierterText = await dokumentTextProvider.textExtrahieren({
      quelldokumentId,
      dateiname: quelldokument.dateiname,
      typ: dateiTypAusMetadaten(quelldokument.mime_typ, quelldokument.dateiname),
      inhalt,
    });
  } catch (fehler) {
    await quelldokumenteRepo.extraktionStatusSetzen(quelldokumentId, 'fehlgeschlagen');
    throw fehler instanceof Error ? fehler : new Error(String(fehler));
  }

  const ergebnis = await extrahiereUndPersistiereProfil({
    kundeId,
    quelle: 'dokument-upload',
    texte: [extrahierterText],
    provider,
    repo,
    kundenProfilRepo,
    optionen,
  });

  const alleErfolgreich = ergebnis.ergebnisseProText.every((teil) => teil.status === 'erfolg');
  await quelldokumenteRepo.extraktionStatusSetzen(quelldokumentId, alleErfolgreich ? 'verarbeitet' : 'fehlgeschlagen');

  return ergebnis;
}

export interface VerarbeiteWebsiteUndPersistiereProfilEingabe {
  kundeId: string;
  website: KundenWebsiteQuelle;
  provider: LLMProvider;
  websiteTextProvider: WebsiteTextProvider;
  repo: KlassifikationsRepository;
  kundenProfilRepo: KundenProfilRepository;
  optionen?: ProfilExtraktionsOptionen;
}

/**
 * Orchestriert den Website-Pfad: relevante Seiten laden (Rechtslage/
 * Allowlist/robots.txt bereits im WebsiteTextProvider durchgesetzt) -> pro
 * Seite eine KI-Extraktion -> Profil schreiben. Kein Storage-Schritt (siehe
 * Decision, Abschnitt "Website-Text: kein Storage").
 */
export async function verarbeiteWebsiteUndPersistiereProfil(
  eingabe: VerarbeiteWebsiteUndPersistiereProfilEingabe,
): Promise<ExtrahiereUndPersistiereProfilResultat> {
  const { kundeId, website, provider, websiteTextProvider, repo, kundenProfilRepo, optionen } = eingabe;

  const texte = await websiteTextProvider.textDerRelevantenSeitenLaden(website);

  return extrahiereUndPersistiereProfil({
    kundeId,
    quelle: 'website-scraping',
    texte,
    provider,
    repo,
    kundenProfilRepo,
    optionen,
  });
}
