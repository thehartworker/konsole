// Zerlegt einen ProfilExtraktionsVorschlag (packages/profil-extraktion) in
// einzelne Vorschlags-Karten für den Editor (Issue #50, Aufgabe C). Bewusst
// eine reine, testbare Funktion ohne Supabase-Bezug -- die Karten leben nur
// im React-State der Editor-Komponente, siehe
// docs/decisions/2026-07-17_konsole-block3-profil-editor.md, Abschnitt 3
// ("Vorschläge sind React-State, nicht Datenbank-Zeilen").
//
// Feld-für-Feld-Mapping bewusst analog zu
// packages/persistence/src/profil-extraktion-orchestrierung.ts
// (kernFelderAusVorschlag/schreibeListenVorschlaegeInsProfil) gehalten,
// damit beide Pfade (dieser hier: Karten fürs UI: der dortige: Batch-
// Persistenz für einen künftigen Ambient-Pfad) bei einer künftigen
// Schema-Änderung im Gleichschritt bleiben.

import type { KundenProfilListenTabelle } from "@konsole/persistence";
import type { ProfilExtraktionsQuelle, ProfilExtraktionsVorschlag } from "@konsole/profil-extraktion";
import { KERN_FELDER, LISTEN_TABELLEN, type KernSektion, type ListenSektion } from "./kundenprofil-felder";

export interface VorschlagZielKern {
  art: "kern";
  feldname: string;
}

export interface VorschlagZielListe {
  art: "liste";
  tabelle: KundenProfilListenTabelle;
  zeile: Record<string, unknown>;
}

export interface Vorschlag {
  /** Stabil innerhalb EINER Extraktion (kein sitzungsübergreifender Bezug, siehe Decision). */
  id: string;
  sektion: KernSektion | ListenSektion;
  sektionsLabel: string;
  feldLabel: string;
  wertAnzeige: string;
  ziel: VorschlagZielKern | VorschlagZielListe;
  quelle: ProfilExtraktionsQuelle;
  quelleBezeichnung: string;
  stand: string;
}

export const SEKTIONS_LABEL: Record<KernSektion | ListenSektion, string> = {
  fakten: "Fakten",
  ton_und_stimme: "Ton und Stimme",
  strategie: "Strategie",
  grenzen_und_governance: "Grenzen und Governance",
  referenzen_und_operatives: "Referenzen und Operatives",
};

function kernKarte(
  feldname: string,
  wert: string | null,
  quelle: ProfilExtraktionsQuelle,
  quelleBezeichnung: string,
  stand: string,
): Vorschlag | null {
  if (wert === null) return null;
  const konfiguration = KERN_FELDER.find((f) => f.key === feldname);
  if (!konfiguration) return null;
  return {
    id: `kern:${feldname}`,
    sektion: konfiguration.sektion,
    sektionsLabel: SEKTIONS_LABEL[konfiguration.sektion],
    feldLabel: konfiguration.label,
    wertAnzeige: wert,
    ziel: { art: "kern", feldname },
    quelle,
    quelleBezeichnung,
    stand,
  };
}

function listenKarten(
  tabelle: KundenProfilListenTabelle,
  zeilen: Record<string, unknown>[],
  wertAnzeige: (zeile: Record<string, unknown>) => string,
  quelle: ProfilExtraktionsQuelle,
  quelleBezeichnung: string,
  stand: string,
): Vorschlag[] {
  const konfiguration = LISTEN_TABELLEN.find((t) => t.tabelle === tabelle);
  if (!konfiguration) return [];
  return zeilen.map((zeile, index) => ({
    id: `${tabelle}:${index}`,
    sektion: konfiguration.sektion,
    sektionsLabel: SEKTIONS_LABEL[konfiguration.sektion],
    feldLabel: konfiguration.einzahl,
    wertAnzeige: wertAnzeige(zeile),
    ziel: { art: "liste" as const, tabelle, zeile },
    quelle,
    quelleBezeichnung,
    stand,
  }));
}

export function vorschlaegeAusExtraktion(
  vorschlag: ProfilExtraktionsVorschlag,
  quelle: ProfilExtraktionsQuelle,
  quelleBezeichnung: string,
  stand: string,
): Vorschlag[] {
  const kern = [
    kernKarte("rechtsform", vorschlag.fakten.rechtsform, quelle, quelleBezeichnung, stand),
    kernKarte("sitz", vorschlag.fakten.sitz, quelle, quelleBezeichnung, stand),
    kernKarte("geschaeftsbeschreibung", vorschlag.fakten.geschaeftsbeschreibung, quelle, quelleBezeichnung, stand),
    kernKarte("grundton", vorschlag.stimme.grundton, quelle, quelleBezeichnung, stand),
    kernKarte("anrede_konvention", vorschlag.stimme.anrede_konvention, quelle, quelleBezeichnung, stand),
    kernKarte("gendering_konvention", vorschlag.stimme.gendering_konvention, quelle, quelleBezeichnung, stand),
    kernKarte("zielsprache_absender_texte", vorschlag.stimme.zielsprache_absender_texte, quelle, quelleBezeichnung, stand),
    kernKarte("positionierung", vorschlag.strategie.positionierung, quelle, quelleBezeichnung, stand),
    kernKarte("usp", vorschlag.strategie.usp, quelle, quelleBezeichnung, stand),
  ].filter((karte): karte is Vorschlag => karte !== null);

  const boilerplate = listenKarten(
    "kunden_boilerplate",
    vorschlag.boilerplate.map((b) => ({ typ: b.typ, sprache: b.sprache, text: b.text })),
    (z) => String(z.text ?? ""),
    quelle,
    quelleBezeichnung,
    stand,
  );

  // stichtag/quelle sind hier bereits nicht-null: wendeKonservativesPrinzipAn
  // (packages/profil-extraktion/src/konservativ.ts, innerhalb von
  // extrahiereProfilVorschlag) hat jede unvollständige Kennzahl vorher schon
  // verworfen, siehe Kommentar in profil-extraktion-orchestrierung.ts.
  const kennzahlen = listenKarten(
    "kunden_kennzahlen",
    vorschlag.kennzahlen
      .filter((k) => k.stichtag && k.quelle)
      .map((k) => ({ bezeichnung: k.bezeichnung, wert: k.wert, stichtag: k.stichtag as string, quelle: k.quelle as string })),
    (z) => `${String(z.bezeichnung ?? "")}: ${String(z.wert ?? "")}`,
    quelle,
    quelleBezeichnung,
    stand,
  );

  const sprecher = listenKarten(
    "kunden_sprecher",
    vorschlag.sprecher.map((s) => ({
      name: s.name,
      rolle: s.rolle,
      exakte_schreibweise: s.exakte_schreibweise,
      zitat_freigabe: s.zitat_freigabe,
    })),
    (z) => String(z.name ?? ""),
    quelle,
    quelleBezeichnung,
    stand,
  );

  const kernbotschaften = listenKarten(
    "kunden_kernbotschaften",
    vorschlag.kernbotschaften.map((k) => ({ text: k.text, reihenfolge: k.reihenfolge })),
    (z) => String(z.text ?? ""),
    quelle,
    quelleBezeichnung,
    stand,
  );

  const themen = listenKarten(
    "kunden_themen",
    vorschlag.themen.map((t) => ({
      thema: t.thema,
      sprachregelung: t.sprachregelung,
      reaktives_statement: t.reaktives_statement,
      positionierung_vorhanden: t.positionierung_vorhanden,
    })),
    (z) => String(z.thema ?? ""),
    quelle,
    quelleBezeichnung,
    stand,
  );

  const grenzen = listenKarten(
    "kunden_grenzen",
    vorschlag.grenzen.map((g) => ({
      typ: g.typ,
      inhalt: g.inhalt,
      textart_geltungsbereich: g.textart_geltungsbereich,
      // Ein KI-Vorschlag darf das Scharf-Schalten nie selbst aktivieren,
      // gleiches Prinzip wie im Batch-Persistenz-Pfad.
      ist_deterministisch_erzwungen: false,
    })),
    (z) => String(z.inhalt ?? ""),
    quelle,
    quelleBezeichnung,
    stand,
  );

  const medienKontext = listenKarten(
    "kunden_medien_kontext",
    vorschlag.medien_kontext.map((m) => ({
      medium_name: m.medium_name,
      journalist_name: m.journalist_name,
      beziehungsnotiz: m.beziehungsnotiz,
      prioritaet: m.prioritaet,
    })),
    (z) => String(z.medium_name ?? ""),
    quelle,
    quelleBezeichnung,
    stand,
  );

  return [...kern, ...boilerplate, ...kennzahlen, ...sprecher, ...kernbotschaften, ...themen, ...grenzen, ...medienKontext];
}
