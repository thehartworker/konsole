// Lade-Funktionen für /vorgaenge und /vorgaenge/[id]. Laufen ausschließlich
// über den Session-Client (siehe src/lib/supabase/server.ts) -- RLS ist die
// einzige Durchsetzungsinstanz (AGENTS.md §4), keine zusätzliche
// Anwendungs-Filterung nach agentur_id/kunde_id nötig oder gewollt.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface VorgangListenEintrag {
  id: string;
  kunde_name: string;
  kanal: string;
  absender_identifikator: string;
  absender_name: string | null;
  betreff: string | null;
  typ_primaer: string | null;
  prioritaet: string | null;
  sensitivity: string;
  status: string;
  klassifikation_status: string;
  eingang_at: string;
}

export async function ladeVorgaengeListe(
  supabase: SupabaseClient,
): Promise<VorgangListenEintrag[]> {
  const { data, error } = await supabase
    .from("vorgaenge")
    .select(
      "id, kanal, absender_identifikator, absender_name, betreff, typ_primaer, prioritaet, sensitivity, status, klassifikation_status, eingang_at, kunden(name)",
    )
    .is("deleted_at", null)
    .order("eingang_at", { ascending: false });

  if (error) {
    throw new Error(`ladeVorgaengeListe: ${error.message}`);
  }

  return (data ?? []).map((zeile) => {
    const kundenRaw = (zeile as { kunden?: unknown }).kunden;
    const kunde = Array.isArray(kundenRaw) ? kundenRaw[0] : kundenRaw;
    return {
      id: zeile.id,
      kunde_name: (kunde as { name?: string } | undefined)?.name ?? "Unbekannter Kunde",
      kanal: zeile.kanal,
      absender_identifikator: zeile.absender_identifikator,
      absender_name: zeile.absender_name,
      betreff: zeile.betreff,
      typ_primaer: zeile.typ_primaer,
      prioritaet: zeile.prioritaet,
      sensitivity: zeile.sensitivity,
      status: zeile.status,
      klassifikation_status: zeile.klassifikation_status,
      eingang_at: zeile.eingang_at,
    };
  });
}

export interface VorgangDetail {
  id: string;
  agentur_id: string;
  kunde_id: string;
  kunde_name: string;
  kanal: string;
  absender_identifikator: string;
  absender_name: string | null;
  absender_rolle: string | null;
  eingang_at: string;
  betreff: string | null;
  inhalt_text: string;
  sprache_ausgang: string | null;
  typ_primaer: string | null;
  typ_sekundaer: string | null;
  confidence: number | null;
  sensitivity: string;
  prioritaet: string | null;
  routing_rolle: string | null;
  zustaendige_nutzer_id: string | null;
  status: string;
  klassifikation_status: string;
  rueckfrage_nachricht: string | null;
  rueckfrage_bereit_am: string | null;
  rueckfrage_freigegeben_durch: string | null;
}

export interface AnliegenZeile {
  id: string;
  vorgang_id: string;
  beschreibung: string;
  prioritaet: string;
  frist_erschlossen: string | null;
  frist_annahme: string | null;
  backend_handler_vorschlag: string | null;
  backend_handler_input: Record<string, unknown>;
}

export interface HandlerAufrufZeile {
  id: string;
  vorgang_id: string;
  anliegen_id: string;
  handler_slug: string;
  status: string;
  ergebnis: Record<string, unknown> | null;
  /**
   * Bearbeiteter Zustand relativ zu `ergebnis`, siehe Migration
   * 20260713190000_konsole_block2_editing.sql. NULL heißt unverändert.
   * Anzeige/Export lesen immer `ergebnis_bearbeitet ?? ergebnis`.
   */
  ergebnis_bearbeitet: Record<string, unknown> | null;
  bearbeitet_at: string | null;
  fehler: string | null;
  freigegeben_at: string | null;
  freigegeben_durch: string | null;
}

export interface VorgangDetailBundle {
  vorgang: VorgangDetail;
  anliegen: AnliegenZeile[];
  handlerAufrufe: HandlerAufrufZeile[];
  /** id -> name, für "wer hat freigegeben/ist zuständig" in der Freigabe-Anzeige. */
  nutzerNamen: Record<string, string>;
}

export async function ladeVorgangDetail(
  supabase: SupabaseClient,
  vorgangId: string,
): Promise<VorgangDetailBundle | null> {
  const { data: vorgangRaw, error: vorgangFehler } = await supabase
    .from("vorgaenge")
    .select(
      "id, agentur_id, kunde_id, kanal, absender_identifikator, absender_name, absender_rolle, eingang_at, betreff, inhalt_text, sprache_ausgang, typ_primaer, typ_sekundaer, confidence, sensitivity, prioritaet, routing_rolle, zustaendige_nutzer_id, status, klassifikation_status, rueckfrage_nachricht, rueckfrage_bereit_am, rueckfrage_freigegeben_durch, kunden(name)",
    )
    .eq("id", vorgangId)
    .is("deleted_at", null)
    .maybeSingle();

  if (vorgangFehler) {
    throw new Error(`ladeVorgangDetail: ${vorgangFehler.message}`);
  }
  if (!vorgangRaw) {
    return null;
  }

  const kundenRaw = (vorgangRaw as { kunden?: unknown }).kunden;
  const kunde = Array.isArray(kundenRaw) ? kundenRaw[0] : kundenRaw;

  const [{ data: anliegenRaw, error: anliegenFehler }, { data: handlerRaw, error: handlerFehler }] =
    await Promise.all([
      supabase
        .from("anliegen")
        .select(
          "id, vorgang_id, beschreibung, prioritaet, frist_erschlossen, frist_annahme, backend_handler_vorschlag, backend_handler_input",
        )
        .eq("vorgang_id", vorgangId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("handler_aufrufe")
        .select(
          "id, vorgang_id, anliegen_id, handler_slug, status, ergebnis, ergebnis_bearbeitet, bearbeitet_at, fehler, freigegeben_at, freigegeben_durch",
        )
        .eq("vorgang_id", vorgangId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
    ]);

  if (anliegenFehler) {
    throw new Error(`ladeVorgangDetail (anliegen): ${anliegenFehler.message}`);
  }
  if (handlerFehler) {
    throw new Error(`ladeVorgangDetail (handler_aufrufe): ${handlerFehler.message}`);
  }

  const nutzerIds = new Set<string>();
  if (vorgangRaw.zustaendige_nutzer_id) nutzerIds.add(vorgangRaw.zustaendige_nutzer_id);
  if (vorgangRaw.rueckfrage_freigegeben_durch) nutzerIds.add(vorgangRaw.rueckfrage_freigegeben_durch);
  for (const zeile of handlerRaw ?? []) {
    if (zeile.freigegeben_durch) nutzerIds.add(zeile.freigegeben_durch);
  }

  const nutzerNamen: Record<string, string> = {};
  if (nutzerIds.size > 0) {
    const { data: nutzerRaw } = await supabase.from("nutzer").select("id, name").in("id", [...nutzerIds]);
    for (const zeile of nutzerRaw ?? []) {
      nutzerNamen[zeile.id] = zeile.name;
    }
  }

  return {
    nutzerNamen,
    vorgang: {
      id: vorgangRaw.id,
      agentur_id: vorgangRaw.agentur_id,
      kunde_id: vorgangRaw.kunde_id,
      kunde_name: (kunde as { name?: string } | undefined)?.name ?? "Unbekannter Kunde",
      kanal: vorgangRaw.kanal,
      absender_identifikator: vorgangRaw.absender_identifikator,
      absender_name: vorgangRaw.absender_name,
      absender_rolle: vorgangRaw.absender_rolle,
      eingang_at: vorgangRaw.eingang_at,
      betreff: vorgangRaw.betreff,
      inhalt_text: vorgangRaw.inhalt_text,
      sprache_ausgang: vorgangRaw.sprache_ausgang,
      typ_primaer: vorgangRaw.typ_primaer,
      typ_sekundaer: vorgangRaw.typ_sekundaer,
      confidence: vorgangRaw.confidence,
      sensitivity: vorgangRaw.sensitivity,
      prioritaet: vorgangRaw.prioritaet,
      routing_rolle: vorgangRaw.routing_rolle,
      zustaendige_nutzer_id: vorgangRaw.zustaendige_nutzer_id,
      status: vorgangRaw.status,
      klassifikation_status: vorgangRaw.klassifikation_status,
      rueckfrage_nachricht: vorgangRaw.rueckfrage_nachricht,
      rueckfrage_bereit_am: vorgangRaw.rueckfrage_bereit_am,
      rueckfrage_freigegeben_durch: vorgangRaw.rueckfrage_freigegeben_durch,
    },
    anliegen: (anliegenRaw ?? []) as AnliegenZeile[],
    handlerAufrufe: (handlerRaw ?? []) as HandlerAufrufZeile[],
  };
}
