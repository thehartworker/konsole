"use server";

// Server-Actions für die Freigabe-Aktionen der Detailansicht (Issue #43).
// Alle drei laufen über den Session-Client (createClient(), RLS aktiv) --
// AGENTS.md §4: "Keine Umgehung der Row-Level-Security". Das ist die erste
// Stelle im Repository, an der ein Backend-Handler (W1/W2) scharf aus der
// UI heraus aufgerufen wird. Shadow-Mode-konform: es wird nur ein Entwurf
// erzeugt und gespeichert, nichts versendet (SCOPE-GRENZE, siehe
// docs/decisions/2026-07-13_konsole-block1-vorgangs-detailansicht.md).
//
// Die eigentlichen Payloads (was genau geschrieben wird) kommen aus
// src/lib/freigabe-payloads.ts -- rein, ohne Supabase-Bezug, direkt testbar
// (siehe tests/lib/freigabe-payloads.test.ts). Diese Datei ist bewusst nur
// noch Verkabelung: laden, Berechtigung/Existenz prüfen, Payload bauen,
// schreiben.

import { revalidatePath } from "next/cache";
import { AnthropicProvider } from "@konsole/llm";
import {
  SupabaseHandlerAufrufRepository,
  SupabaseKlassifikationsRepository,
  SupabaseKundenProfilRepository,
  SupabasePruefregelnRepository,
  fuehreW1AusUndProtokolliere,
  fuehreW2AusUndProtokolliere,
} from "@konsole/persistence";
import {
  PRESSEMITTEILUNG_EXPORT_MIME,
  W1_HANDLER_SLUG,
  W2_HANDLER_SLUG,
  pressemitteilungDateiname,
  renderPressemitteilungDocx,
  renderPressemitteilungPdf,
  renderPressemitteilungText,
  type PressemitteilungExportFormat,
  type W1Output,
} from "@konsole/handlers";
import { createClient } from "@/lib/supabase/server";
import { briefingAusAnliegen, anfrageAusAnliegen } from "@/lib/handler-input";
import type { AnliegenZeile } from "@/lib/vorgaenge";
import type { PressemitteilungPatch } from "@/lib/pressemitteilung-patch";
import { pressemitteilungBearbeiten, type PressemitteilungBearbeitenResultat } from "@/lib/pressemitteilung-bearbeiten";
import {
  auditLogFreigabePayload,
  auditLogHandlerAufgerufenPayload,
  handlerAufrufAbschliessenPayload,
  handlerAufrufEinfuegenPayload,
  handlerFreigebenPayload,
  rueckfrageSendenPayload,
} from "@/lib/freigabe-payloads";

export type HandlerAusloesenResultat =
  | { status: "erfolg" }
  | { status: "fehler"; meldung: string };

export async function handlerAusloesenAction(
  vorgangId: string,
  anliegenId: string,
): Promise<HandlerAusloesenResultat> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "fehler", meldung: "Nicht angemeldet." };
  }

  const { data: vorgang, error: vorgangFehler } = await supabase
    .from("vorgaenge")
    .select("id, agentur_id, kunde_id, zustaendige_nutzer_id")
    .eq("id", vorgangId)
    .maybeSingle();
  if (vorgangFehler || !vorgang) {
    return { status: "fehler", meldung: "Vorgang nicht gefunden oder keine Berechtigung." };
  }

  const { data: anliegen, error: anliegenFehler } = await supabase
    .from("anliegen")
    .select("id, beschreibung, prioritaet, frist_erschlossen, backend_handler_vorschlag, backend_handler_input")
    .eq("id", anliegenId)
    .eq("vorgang_id", vorgangId)
    .maybeSingle();
  if (anliegenFehler || !anliegen) {
    return { status: "fehler", meldung: "Anliegen nicht gefunden oder keine Berechtigung." };
  }
  if (!anliegen.backend_handler_vorschlag) {
    return { status: "fehler", meldung: "Für dieses Anliegen ist kein Handler vorgeschlagen." };
  }
  const handlerSlug = anliegen.backend_handler_vorschlag as string;
  if (handlerSlug !== W1_HANDLER_SLUG && handlerSlug !== W2_HANDLER_SLUG) {
    return { status: "fehler", meldung: `Handler "${handlerSlug}" kann noch nicht aus der Konsole ausgelöst werden.` };
  }

  const zustaendigeNutzerId = vorgang.zustaendige_nutzer_id ?? user.id;
  const anliegenTyped = anliegen as unknown as AnliegenZeile;
  const briefingInput = handlerSlug === W1_HANDLER_SLUG ? briefingAusAnliegen(anliegenTyped) : null;
  const anfrageInput = handlerSlug === W2_HANDLER_SLUG ? anfrageAusAnliegen(anliegenTyped) : null;

  const { data: handlerAufruf, error: insertFehler } = await supabase
    .from("handler_aufrufe")
    .insert(
      handlerAufrufEinfuegenPayload({
        vorgangId,
        anliegenId,
        agenturId: vorgang.agentur_id,
        kundeId: vorgang.kunde_id,
        handlerSlug,
        input: (briefingInput ?? anfrageInput ?? {}) as Record<string, unknown>,
        zustaendigeNutzerId,
        prioritaet: anliegen.prioritaet,
      }),
    )
    .select("id")
    .single();

  if (insertFehler || !handlerAufruf) {
    return { status: "fehler", meldung: `Handler-Aufruf konnte nicht angelegt werden: ${insertFehler?.message ?? "unbekannter Fehler"}` };
  }

  const repo = new SupabaseKlassifikationsRepository(supabase);
  const kundenProfilRepo = new SupabaseKundenProfilRepository(supabase);
  const provider = new AnthropicProvider();

  const resultat =
    handlerSlug === W1_HANDLER_SLUG
      ? await fuehreW1AusUndProtokolliere({
          kundeId: vorgang.kunde_id,
          vorgangId,
          briefing: briefingInput!,
          provider,
          repo,
          kundenProfilRepo,
        })
      : await fuehreW2AusUndProtokolliere({
          kundeId: vorgang.kunde_id,
          vorgangId,
          anfrage: anfrageInput!,
          provider,
          repo,
          pruefregelnRepo: new SupabasePruefregelnRepository(supabase),
          kundenProfilRepo,
        });

  await supabase.from("handler_aufrufe").update(handlerAufrufAbschliessenPayload(resultat)).eq("id", handlerAufruf.id);

  await supabase.from("audit_log").insert(
    auditLogHandlerAufgerufenPayload({
      agenturId: vorgang.agentur_id,
      vorgangId,
      nutzerId: user.id,
      handlerSlug,
      anliegenId,
      resultatStatus: resultat.status,
    }),
  );

  revalidatePath(`/vorgaenge/${vorgangId}`);

  if (resultat.status === "fehlgeschlagen") {
    return { status: "fehler", meldung: resultat.fehler };
  }
  return { status: "erfolg" };
}

export async function handlerFreigebenAction(
  vorgangId: string,
  handlerAufrufId: string,
): Promise<HandlerAusloesenResultat> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "fehler", meldung: "Nicht angemeldet." };
  }

  const { data: vorgang } = await supabase.from("vorgaenge").select("agentur_id").eq("id", vorgangId).maybeSingle();
  if (!vorgang) {
    return { status: "fehler", meldung: "Vorgang nicht gefunden oder keine Berechtigung." };
  }

  const { data, error } = await supabase
    .from("handler_aufrufe")
    .update(handlerFreigebenPayload(user.id))
    .eq("id", handlerAufrufId)
    .eq("vorgang_id", vorgangId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { status: "fehler", meldung: "Freigabe fehlgeschlagen (keine Berechtigung oder Eintrag nicht gefunden)." };
  }

  await supabase.from("audit_log").insert(
    auditLogFreigabePayload({
      agenturId: vorgang.agentur_id,
      vorgangId,
      nutzerId: user.id,
      typ: "handler_ergebnis",
      handlerAufrufId,
    }),
  );

  revalidatePath(`/vorgaenge/${vorgangId}`);
  return { status: "erfolg" };
}

export async function rueckfrageSendenAction(
  vorgangId: string,
  text: string,
): Promise<HandlerAusloesenResultat> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "fehler", meldung: "Nicht angemeldet." };
  }
  if (!text.trim()) {
    return { status: "fehler", meldung: "Rückfrage-Text darf nicht leer sein." };
  }

  const { data: vorgang, error } = await supabase
    .from("vorgaenge")
    .update(rueckfrageSendenPayload(text, user.id))
    .eq("id", vorgangId)
    .select("agentur_id")
    .maybeSingle();

  if (error || !vorgang) {
    return { status: "fehler", meldung: "Freigabe fehlgeschlagen (keine Berechtigung oder Vorgang nicht gefunden)." };
  }

  await supabase.from("audit_log").insert(
    auditLogFreigabePayload({ agenturId: vorgang.agentur_id, vorgangId, nutzerId: user.id, typ: "rueckfrage" }),
  );

  revalidatePath(`/vorgaenge/${vorgangId}`);
  return { status: "erfolg" };
}

// ============================================================
// Inline-Editing und Export der W1-Pressemitteilung (Issue #45). Siehe
// docs/decisions/2026-07-13_konsole-block2-editing-und-export.md.
// ============================================================

export type { PressemitteilungBearbeitenResultat };

/**
 * Nimmt einen Feld-Patch (nicht das ganze Dokument), lädt den aktuellen
 * Stand (`ergebnis_bearbeitet ?? ergebnis`) und reicht das Zusammenführen/
 * Validieren/Schreiben an pressemitteilungBearbeiten() weiter (testbarer
 * Kern, siehe src/lib/pressemitteilung-bearbeiten.ts). Der Client
 * (pressemitteilung-editor.tsx) zeigt die Änderung optimistisch sofort an
 * und rollt bei "fehler" zurück, siehe Decision, Abschnitt 8.
 */
export async function pressemitteilungBearbeitenAction(
  handlerAufrufId: string,
  patch: PressemitteilungPatch,
): Promise<PressemitteilungBearbeitenResultat> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "fehler", meldung: "Nicht angemeldet." };
  }

  const { data: zeile, error } = await supabase
    .from("handler_aufrufe")
    .select("id, vorgang_id, handler_slug, ergebnis, ergebnis_bearbeitet")
    .eq("id", handlerAufrufId)
    .maybeSingle();
  if (error || !zeile) {
    return { status: "fehler", meldung: "Handler-Ergebnis nicht gefunden oder keine Berechtigung." };
  }
  if (zeile.handler_slug !== W1_HANDLER_SLUG) {
    return { status: "fehler", meldung: `Inline-Editing ist für "${zeile.handler_slug}" noch nicht verfügbar.` };
  }

  const basis = (zeile.ergebnis_bearbeitet ?? zeile.ergebnis) as unknown as W1Output | null;
  if (!basis) {
    return { status: "fehler", meldung: "Für diesen Handler-Aufruf liegt noch kein Ergebnis vor." };
  }

  const repo = new SupabaseHandlerAufrufRepository(supabase);
  const resultat = await pressemitteilungBearbeiten(repo, handlerAufrufId, basis, patch);
  if (resultat.status === "erfolg") {
    revalidatePath(`/vorgaenge/${zeile.vorgang_id}`);
  }
  return resultat;
}

async function pressemitteilungFuerExportLaden(
  handlerAufrufId: string,
): Promise<{ output: W1Output; firmenname: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: zeile } = await supabase
    .from("handler_aufrufe")
    .select("handler_slug, ergebnis, ergebnis_bearbeitet, kunden(name)")
    .eq("id", handlerAufrufId)
    .maybeSingle();
  if (!zeile || zeile.handler_slug !== W1_HANDLER_SLUG) return null;

  const output = (zeile.ergebnis_bearbeitet ?? zeile.ergebnis) as unknown as W1Output | null;
  if (!output) return null;

  const kundenRaw = (zeile as { kunden?: unknown }).kunden;
  const kunde = Array.isArray(kundenRaw) ? kundenRaw[0] : kundenRaw;
  const firmenname = (kunde as { name?: string } | undefined)?.name ?? "Kunde";

  return { output, firmenname };
}

export type PressemitteilungExportResultat =
  | { status: "erfolg"; dateiname: string; mime: string; inhaltBase64: string }
  | { status: "fehler"; meldung: string };

async function pressemitteilungExportAction(
  handlerAufrufId: string,
  format: PressemitteilungExportFormat,
): Promise<PressemitteilungExportResultat> {
  const geladen = await pressemitteilungFuerExportLaden(handlerAufrufId);
  if (!geladen) {
    return { status: "fehler", meldung: "Pressemitteilung nicht gefunden oder keine Berechtigung." };
  }

  const draft = geladen.output.pressemitteilung;
  const inhalt: Buffer =
    format === "pdf"
      ? await renderPressemitteilungPdf(draft)
      : format === "docx"
        ? await renderPressemitteilungDocx(draft)
        : Buffer.from(renderPressemitteilungText(draft), "utf-8");

  return {
    status: "erfolg",
    dateiname: pressemitteilungDateiname(geladen.firmenname, new Date(), format),
    mime: PRESSEMITTEILUNG_EXPORT_MIME[format],
    inhaltBase64: inhalt.toString("base64"),
  };
}

export async function pressemitteilungExportPdfAction(handlerAufrufId: string): Promise<PressemitteilungExportResultat> {
  return pressemitteilungExportAction(handlerAufrufId, "pdf");
}

export async function pressemitteilungExportDocxAction(handlerAufrufId: string): Promise<PressemitteilungExportResultat> {
  return pressemitteilungExportAction(handlerAufrufId, "docx");
}

export async function pressemitteilungExportTextAction(handlerAufrufId: string): Promise<PressemitteilungExportResultat> {
  return pressemitteilungExportAction(handlerAufrufId, "text");
}
