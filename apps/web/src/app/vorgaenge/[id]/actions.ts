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
  SupabaseKlassifikationsRepository,
  SupabaseKundenProfilRepository,
  SupabasePruefregelnRepository,
  fuehreW1AusUndProtokolliere,
  fuehreW2AusUndProtokolliere,
} from "@konsole/persistence";
import { W1_HANDLER_SLUG, W2_HANDLER_SLUG } from "@konsole/handlers";
import { createClient } from "@/lib/supabase/server";
import { briefingAusAnliegen, anfrageAusAnliegen } from "@/lib/handler-input";
import type { AnliegenZeile } from "@/lib/vorgaenge";
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
