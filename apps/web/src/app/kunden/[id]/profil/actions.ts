"use server";

// Server-Actions für den Kundenprofil-Editor (Issue #50, Konsole Block 3,
// Aufgabe F). Alle manuellen Speicherpfade laufen über den Session-Client
// (RLS ist die Durchsetzungsinstanz, AGENTS.md §4, siehe Migration
// 20260717120000_kundenprofil_schreibrechte.sql). Der Dokument-Upload nutzt
// zusätzlich die Service-Role NUR für den Storage-Zugriff (unverändert
// gegenüber dem bestehenden kunden_quelldokumente-Muster) -- die
// Berechtigungsprüfung selbst (darf dieser Nutzer für diesen Kunden
// extrahieren) läuft vorher über den Session-Client.
//
// Extraktion und Persistenz sind hier BEWUSST entkoppelt (anders als
// packages/persistence/src/profil-extraktion-orchestrierung.ts): Vorschläge
// werden nie automatisch geschrieben, sondern als Vorschlags-Karten an den
// Client zurückgegeben. Erst uebernehmeVorschlagAction schreibt EINEN
// einzelnen Vorschlag. Siehe
// docs/decisions/2026-07-17_konsole-block3-profil-editor.md, Abschnitt 3.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AnthropicProvider } from "@konsole/llm";
import {
  SupabaseKlassifikationsRepository,
  SupabaseKundenProfilRepository,
  type KundenProfilElementStatus,
  type KundenProfilListenTabelle,
} from "@konsole/persistence";
import { ProduktiverDokumentTextProvider, ProduktiverWebsiteTextProvider, type HochgeladeneDateiTyp } from "@konsole/profil-extraktion";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { fuehreProfilExtraktionAus } from "@/lib/profil-extraktion-ausfuehren";
import { vorschlaegeAusExtraktion, type Vorschlag } from "@/lib/profil-vorschlaege";
import { KERN_FELD_VALIDATOREN, listenZeilenSchema } from "@/lib/kundenprofil-felder";

export type AktionsResultat = { status: "erfolg" } | { status: "fehler"; meldung: string };
export type ListenzeileSpeichernResultat = { status: "erfolg"; id: string } | { status: "fehler"; meldung: string };

async function angemeldetenNutzerLaden() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// ============================================================
// Aufgabe F: manuelles Editieren
// ============================================================

export async function speichereKopfFeldAction(
  kundeId: string,
  feldname: string,
  wert: unknown,
  status: KundenProfilElementStatus = "freigegeben",
): Promise<AktionsResultat> {
  const validator = KERN_FELD_VALIDATOREN[feldname];
  if (!validator) {
    return { status: "fehler", meldung: `Unbekanntes Feld "${feldname}".` };
  }
  const geparst = validator.safeParse(wert);
  if (!geparst.success) {
    return { status: "fehler", meldung: "Ungültiger Wert für dieses Feld." };
  }

  const { supabase, user } = await angemeldetenNutzerLaden();
  if (!user) return { status: "fehler", meldung: "Nicht angemeldet." };

  try {
    await new SupabaseKundenProfilRepository(supabase).kernFeldManuellSpeichern(kundeId, feldname, geparst.data, status);
  } catch (fehler) {
    return { status: "fehler", meldung: fehler instanceof Error ? fehler.message : "Speichern fehlgeschlagen." };
  }

  revalidatePath(`/kunden/${kundeId}/profil`);
  return { status: "erfolg" };
}

export async function speichereListenzeileAction(
  tabelle: KundenProfilListenTabelle,
  zeile: Record<string, unknown> & { id?: string },
  kundeId: string,
  status: KundenProfilElementStatus = "freigegeben",
): Promise<ListenzeileSpeichernResultat> {
  let schema;
  try {
    schema = listenZeilenSchema(tabelle);
  } catch {
    return { status: "fehler", meldung: `Unbekannte Tabelle "${tabelle}".` };
  }

  const { id, ...rest } = zeile;
  const geparst = schema.safeParse(rest);
  if (!geparst.success) {
    return { status: "fehler", meldung: "Ungültige Eingabe." };
  }

  const { supabase, user } = await angemeldetenNutzerLaden();
  if (!user) return { status: "fehler", meldung: "Nicht angemeldet." };

  try {
    const ergebnis = await new SupabaseKundenProfilRepository(supabase).listenzeileManuellSpeichern(
      tabelle,
      kundeId,
      { ...geparst.data, id },
      status,
    );
    revalidatePath(`/kunden/${kundeId}/profil`);
    return { status: "erfolg", id: ergebnis.id };
  } catch (fehler) {
    return { status: "fehler", meldung: fehler instanceof Error ? fehler.message : "Speichern fehlgeschlagen." };
  }
}

export async function entferneListenzeileAction(
  tabelle: KundenProfilListenTabelle,
  zeileId: string,
  kundeId: string,
): Promise<AktionsResultat> {
  const { supabase, user } = await angemeldetenNutzerLaden();
  if (!user) return { status: "fehler", meldung: "Nicht angemeldet." };

  try {
    await new SupabaseKundenProfilRepository(supabase).listenzeileEntfernen(tabelle, zeileId, kundeId);
  } catch (fehler) {
    return { status: "fehler", meldung: fehler instanceof Error ? fehler.message : "Entfernen fehlgeschlagen." };
  }

  revalidatePath(`/kunden/${kundeId}/profil`);
  return { status: "erfolg" };
}

export type GebeFreiZiel = { art: "kern"; feldname: string } | { art: "liste"; tabelle: KundenProfilListenTabelle; zeileId: string };

export async function gebeFeldFreiAction(ziel: GebeFreiZiel, kundeId: string): Promise<AktionsResultat> {
  const { supabase, user } = await angemeldetenNutzerLaden();
  if (!user) return { status: "fehler", meldung: "Nicht angemeldet." };

  const repo = new SupabaseKundenProfilRepository(supabase);
  try {
    if (ziel.art === "kern") {
      await repo.feldStatusSetzen(kundeId, ziel.feldname, "freigegeben");
    } else {
      await repo.elementStatusSetzen(ziel.tabelle, ziel.zeileId, "freigegeben");
    }
  } catch (fehler) {
    return { status: "fehler", meldung: fehler instanceof Error ? fehler.message : "Freigeben fehlgeschlagen." };
  }

  revalidatePath(`/kunden/${kundeId}/profil`);
  return { status: "erfolg" };
}

// ============================================================
// Aufgabe D: KI-Befüllung als transaktionale Aktion
// ============================================================

export type ExtraktionsResultat =
  | { status: "erfolg"; vorschlaege: Vorschlag[]; quelleBezeichnung: string; unklareHinweise: string[] }
  | { status: "fehler"; meldung: string };

const ERLAUBTE_DOKUMENT_ENDUNGEN = ["pdf", "docx", "txt"];
const MAX_DATEIGROESSE_BYTES = 25 * 1024 * 1024;

function dateiTypAusDateiname(dateiname: string, mimeTyp: string): HochgeladeneDateiTyp {
  const endung = dateiname.toLowerCase().split(".").pop() ?? "";
  if (mimeTyp === "application/pdf" || endung === "pdf") return "pdf";
  if (mimeTyp === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || endung === "docx") return "docx";
  return "text";
}

export async function starteDokumentExtraktionAction(kundeId: string, formData: FormData): Promise<ExtraktionsResultat> {
  const datei = formData.get("datei");
  if (!(datei instanceof File)) {
    return { status: "fehler", meldung: "Keine Datei erhalten." };
  }
  if (datei.size === 0) {
    return { status: "fehler", meldung: "Die Datei ist leer." };
  }
  if (datei.size > MAX_DATEIGROESSE_BYTES) {
    return { status: "fehler", meldung: "Die Datei ist größer als 25 MB." };
  }
  const endung = datei.name.toLowerCase().split(".").pop() ?? "";
  if (!ERLAUBTE_DOKUMENT_ENDUNGEN.includes(endung)) {
    return { status: "fehler", meldung: "Nur PDF, DOCX oder TXT werden unterstützt." };
  }

  const { supabase, user } = await angemeldetenNutzerLaden();
  if (!user) return { status: "fehler", meldung: "Nicht angemeldet." };

  // Berechtigungsprüfung über den Session-Client (RLS, kunden_lesen-Policy),
  // BEVOR die Service-Role für den Storage-Zugriff verwendet wird.
  const { data: kunde } = await supabase.from("kunden").select("id, agentur_id").eq("id", kundeId).maybeSingle();
  if (!kunde) {
    return { status: "fehler", meldung: "Kunde nicht gefunden oder keine Berechtigung." };
  }

  const inhalt = new Uint8Array(await datei.arrayBuffer());
  const serviceClient = createServiceRoleClient();
  const bucketPfad = `${kunde.agentur_id}/${kundeId}/${randomUUID()}-${datei.name}`;

  const { error: uploadFehler } = await serviceClient.storage
    .from("kunden_quelldokumente")
    .upload(bucketPfad, inhalt, { contentType: datei.type || undefined });
  if (uploadFehler) {
    return { status: "fehler", meldung: `Upload fehlgeschlagen: ${uploadFehler.message}` };
  }

  const { data: quelldokument, error: insertFehler } = await serviceClient
    .from("kunden_quelldokumente")
    .insert({
      kunde_id: kundeId,
      bucket_pfad: bucketPfad,
      dateiname: datei.name,
      mime_typ: datei.type || null,
      groesse_bytes: datei.size,
      hochgeladen_von: user.id,
    })
    .select("id")
    .single();
  if (insertFehler || !quelldokument) {
    return { status: "fehler", meldung: `Dokument-Referenz konnte nicht angelegt werden: ${insertFehler?.message ?? "unbekannter Fehler"}` };
  }

  let extrahierterText;
  try {
    extrahierterText = await new ProduktiverDokumentTextProvider().textExtrahieren({
      quelldokumentId: quelldokument.id as string,
      dateiname: datei.name,
      typ: dateiTypAusDateiname(datei.name, datei.type),
      inhalt,
    });
  } catch (fehler) {
    await serviceClient.from("kunden_quelldokumente").update({ extraktion_status: "fehlgeschlagen" }).eq("id", quelldokument.id);
    return {
      status: "fehler",
      meldung: `Text konnte nicht aus dem Dokument gelesen werden: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
    };
  }

  const ergebnis = await fuehreProfilExtraktionAus({
    kundeId,
    quelle: "dokument-upload",
    text: extrahierterText.text,
    bezeichnung: datei.name,
    provider: new AnthropicProvider(),
    repo: new SupabaseKlassifikationsRepository(supabase),
  });

  await serviceClient
    .from("kunden_quelldokumente")
    .update({ extraktion_status: ergebnis.status === "erfolg" ? "verarbeitet" : "fehlgeschlagen" })
    .eq("id", quelldokument.id);

  if (ergebnis.status === "fehler") {
    return { status: "fehler", meldung: ergebnis.meldung };
  }

  const heute = new Date().toISOString().slice(0, 10);
  return {
    status: "erfolg",
    vorschlaege: vorschlaegeAusExtraktion(ergebnis.vorschlag, "dokument-upload", datei.name, heute),
    quelleBezeichnung: datei.name,
    unklareHinweise: ergebnis.vorschlag.unklare_hinweise,
  };
}

const WEBSITE_URL_SCHEMA = z.string().trim().url();

export async function starteWebsiteExtraktionAction(kundeId: string, url: string): Promise<ExtraktionsResultat> {
  const geparst = WEBSITE_URL_SCHEMA.safeParse(url);
  if (!geparst.success) {
    return { status: "fehler", meldung: "Bitte eine gültige URL eingeben (z. B. https://kunde.example)." };
  }

  const { supabase, user } = await angemeldetenNutzerLaden();
  if (!user) return { status: "fehler", meldung: "Nicht angemeldet." };

  const { data: kunde } = await supabase.from("kunden").select("id").eq("id", kundeId).maybeSingle();
  if (!kunde) {
    return { status: "fehler", meldung: "Kunde nicht gefunden oder keine Berechtigung." };
  }

  const domain = new URL(geparst.data).hostname;

  let texte;
  try {
    texte = await new ProduktiverWebsiteTextProvider().textDerRelevantenSeitenLaden({ kundeId, erlaubteDomain: domain });
  } catch (fehler) {
    return {
      status: "fehler",
      meldung: `Website konnte nicht abgerufen werden: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
    };
  }

  if (texte.length === 0) {
    return {
      status: "fehler",
      meldung: "Die Website erlaubt maschinellen Zugriff nicht — bitte Kundenprofil manuell pflegen oder Dokument hochladen.",
    };
  }

  const repo = new SupabaseKlassifikationsRepository(supabase);
  const provider = new AnthropicProvider();
  const heute = new Date().toISOString().slice(0, 10);
  const alleVorschlaege: Vorschlag[] = [];
  const alleUnklarenHinweise: string[] = [];
  let mindestensEinErfolg = false;
  let letzteFehlermeldung: string | null = null;

  for (const text of texte) {
    const ergebnis = await fuehreProfilExtraktionAus({
      kundeId,
      quelle: "website-scraping",
      text: text.text,
      bezeichnung: text.bezeichnung,
      provider,
      repo,
    });
    if (ergebnis.status === "fehler") {
      // eine einzelne Seite darf die übrigen nicht blockieren (Aufgabe D).
      letzteFehlermeldung = ergebnis.meldung;
      continue;
    }
    mindestensEinErfolg = true;
    alleVorschlaege.push(...vorschlaegeAusExtraktion(ergebnis.vorschlag, "website-scraping", text.bezeichnung, heute));
    alleUnklarenHinweise.push(...ergebnis.vorschlag.unklare_hinweise);
  }

  if (!mindestensEinErfolg) {
    return { status: "fehler", meldung: letzteFehlermeldung ?? "Die Extraktion ist für keine der geladenen Seiten gelungen." };
  }

  return { status: "erfolg", vorschlaege: alleVorschlaege, quelleBezeichnung: domain, unklareHinweise: alleUnklarenHinweise };
}

// ============================================================
// Aufgabe C: Vorschläge übernehmen/ablehnen
// ============================================================

export type UebernehmeVorschlagResultat = { status: "erfolg"; id?: string } | { status: "fehler"; meldung: string };

export async function uebernehmeVorschlagAction(vorschlag: Vorschlag, kundeId: string): Promise<UebernehmeVorschlagResultat> {
  const { supabase, user } = await angemeldetenNutzerLaden();
  if (!user) return { status: "fehler", meldung: "Nicht angemeldet." };

  const repo = new SupabaseKundenProfilRepository(supabase);

  try {
    if (vorschlag.ziel.art === "kern") {
      const validator = KERN_FELD_VALIDATOREN[vorschlag.ziel.feldname];
      if (!validator) return { status: "fehler", meldung: `Unbekanntes Feld "${vorschlag.ziel.feldname}".` };
      const geparst = validator.safeParse(vorschlag.wertAnzeige);
      if (!geparst.success) return { status: "fehler", meldung: "Ungültiger Vorschlagswert." };
      await repo.kernFeldManuellSpeichern(kundeId, vorschlag.ziel.feldname, geparst.data, "abgeleitet");
      revalidatePath(`/kunden/${kundeId}/profil`);
      return { status: "erfolg" };
    }

    const schema = listenZeilenSchema(vorschlag.ziel.tabelle);
    const geparst = schema.safeParse(vorschlag.ziel.zeile);
    if (!geparst.success) return { status: "fehler", meldung: "Ungültige Vorschlags-Zeile." };
    const ergebnis = await repo.listenzeileManuellSpeichern(vorschlag.ziel.tabelle, kundeId, geparst.data, "abgeleitet");
    revalidatePath(`/kunden/${kundeId}/profil`);
    return { status: "erfolg", id: ergebnis.id };
  } catch (fehler) {
    return { status: "fehler", meldung: fehler instanceof Error ? fehler.message : "Übernehmen fehlgeschlagen." };
  }
}

/**
 * Bewusst ein no-op: eine abgelehnte Vorschlags-Karte wurde nie persistiert
 * (siehe docs/decisions/2026-07-17_konsole-block3-profil-editor.md,
 * Abschnitt 3) -- "Ablehnen" entfernt die Karte ausschließlich im
 * Client-State. Die Funktion existiert als Server-Action trotzdem (statt
 * gar nichts aufzurufen), damit ein künftiger v2-Anti-Learning-Pfad
 * (verworfene_vorschlaege, siehe Issue "Nicht Teil dieses Blocks") an
 * genau dieser Stelle andocken kann, ohne den Aufrufer in den Editor-
 * Komponenten zu ändern.
 */
export async function verwerfeVorschlagAction(_vorschlagId: string): Promise<AktionsResultat> {
  return { status: "erfolg" };
}
