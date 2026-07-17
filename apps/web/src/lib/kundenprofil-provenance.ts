// Reine Provenance-Text-Funktionen für den Kundenprofil-Editor (Issue #50,
// Aufgabe E). Bewusst ohne Supabase-Bezug, direkt testbar (analog zu
// pressemitteilung-patch.ts). Regel aus dem Issue: eine Herkunfts-Zeile
// erscheint, wenn status !== 'freigegeben' ODER eine Herkunft/Quelle
// gesetzt ist -- ein einmal abgeleiteter, später freigegebener Wert bleibt
// also sichtbar mit Herkunft (Audit-Spur), nur ein von Anfang an manuell
// erfasster und freigegebener Wert bleibt ohne Zeile ("die Wahrheit steht
// für sich", siehe Issue).
//
// Absichtlicher Scope-Cut (siehe docs/decisions/2026-07-17_konsole-block3-profil-editor.md,
// Abschnitt 4): quelle/herkunft sind Kategorien (Dokument-Upload/Website-
// Scraping), keine Dokumentnamen/URLs/Akteur-Namen -- die volle Fußnote aus
// den Issue-Beispielen ("...Broschüre 2026.pdf...", "...von Bastian
// Scherbeck...") ist deshalb nur für noch nicht persistierte Vorschlags-
// Karten möglich (siehe profil-vorschlaege.ts), nicht für bereits im Profil
// stehende Werte.

import type { KundenProfilElementStatus, KundenProfilFeldStatusEintrag } from "@konsole/persistence";

export function formatiereDatum(isoDatum: string): string {
  const [jahr, monat, tag] = isoDatum.slice(0, 10).split("-");
  if (!jahr || !monat || !tag) return isoDatum;
  return `${tag}.${monat}.${jahr}`;
}

function quelleLabel(quelle: string): string {
  if (quelle === "dokument-upload") return "einem Dokument";
  if (quelle === "website-scraping") return "einer Website";
  return "einer KI-Extraktion";
}

/** Provenance-Text für ein Kern-Feld (kunden_profil.feld_status.<feldname>). */
export function kernFeldProvenanceText(eintrag: KundenProfilFeldStatusEintrag | undefined): string | null {
  const status = eintrag?.status ?? "freigegeben";
  const quelle = eintrag?.quelle ?? null;

  if (status === "freigegeben" && !quelle) return null;

  const datum = eintrag?.stand ? formatiereDatum(eintrag.stand) : null;

  if (quelle) {
    const zeitpunkt = datum ? `, extrahiert am ${datum}` : "";
    const freigabeHinweis = status === "freigegeben" ? " (mittlerweile freigegeben)" : "";
    return `abgeleitet aus ${quelleLabel(quelle)}${zeitpunkt}${freigabeHinweis}`;
  }

  const zeitpunkt = datum ? ` am ${datum}` : "";
  return `vorläufig eingetragen${zeitpunkt}, wartet auf Freigabe`;
}

export interface ListenzeileProvenanceEingabe {
  status: KundenProfilElementStatus;
  herkunft?: string | null;
  /** ISO-Zeitstempel (updated_at), als "Näherung" fürs Datum, siehe Issue Aufgabe E. */
  updated_at?: string | null;
}

/** Provenance-Text für eine Listen-Zeile (herkunft-Spalte + updated_at). */
export function listenzeileProvenanceText(zeile: ListenzeileProvenanceEingabe): string | null {
  const { status, herkunft } = zeile;
  if (status === "freigegeben" && !herkunft) return null;

  const datum = zeile.updated_at ? formatiereDatum(zeile.updated_at) : null;

  if (herkunft) {
    const zeitpunkt = datum ? `, extrahiert am ${datum}` : "";
    const freigabeHinweis = status === "freigegeben" ? " (mittlerweile freigegeben)" : "";
    return `abgeleitet aus ${quelleLabel(herkunft)}${zeitpunkt}${freigabeHinweis}`;
  }

  const zeitpunkt = datum ? ` am ${datum}` : "";
  return `vorläufig eingetragen${zeitpunkt}, wartet auf Freigabe`;
}
