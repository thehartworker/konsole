// Reine Payload-Bausteine für die drei Server-Actions in
// src/app/vorgaenge/[id]/actions.ts. Ausgelagert, damit die Shadow-Mode-
// und Freigabe-Garantien (kein Versand-Trigger-Feld, freigegeben_durch ist
// immer die tatsächlich handelnde Person) ohne Supabase-/Netzwerk-Mocking
// direkt testbar sind. Siehe
// docs/decisions/2026-07-13_konsole-block1-vorgangs-detailansicht.md.

import type { FuehreW1AusResultat, FuehreW2AusResultat } from "@konsole/persistence";

export interface HandlerAufrufEinfuegenEingabe {
  vorgangId: string;
  anliegenId: string;
  agenturId: string;
  kundeId: string;
  handlerSlug: string;
  input: Record<string, unknown>;
  zustaendigeNutzerId: string;
  prioritaet: string;
}

/** Immer status "in_progress" -- kein Feld dieses Payloads kann einen Versand auslösen. */
export function handlerAufrufEinfuegenPayload(eingabe: HandlerAufrufEinfuegenEingabe) {
  return {
    vorgang_id: eingabe.vorgangId,
    anliegen_id: eingabe.anliegenId,
    agentur_id: eingabe.agenturId,
    kunde_id: eingabe.kundeId,
    handler_slug: eingabe.handlerSlug,
    input: eingabe.input,
    zustaendige_nutzer_id: eingabe.zustaendigeNutzerId,
    prioritaet: eingabe.prioritaet,
    status: "in_progress" as const,
    gestartet_at: new Date().toISOString(),
  };
}

/**
 * Nach einem Handler-Lauf: nur "done"/"ergebnis" oder "failed"/"fehler".
 * SCOPE-GRENZE (Issue #43): kein Feld dieses Payloads löst einen Versand
 * aus, das Ergebnis wird ausschließlich gespeichert.
 */
export function handlerAufrufAbschliessenPayload(
  resultat: FuehreW1AusResultat | FuehreW2AusResultat,
): { status: "done"; ergebnis: unknown; beendet_at: string } | { status: "failed"; fehler: string; beendet_at: string } {
  const beendetAt = new Date().toISOString();
  if (resultat.status === "erfolg") {
    return { status: "done", ergebnis: resultat.output, beendet_at: beendetAt };
  }
  return { status: "failed", fehler: resultat.fehler, beendet_at: beendetAt };
}

export function auditLogHandlerAufgerufenPayload(eingabe: {
  agenturId: string;
  vorgangId: string;
  nutzerId: string;
  handlerSlug: string;
  anliegenId: string;
  resultatStatus: "erfolg" | "fehlgeschlagen";
}) {
  return {
    agentur_id: eingabe.agenturId,
    vorgang_id: eingabe.vorgangId,
    nutzer_id: eingabe.nutzerId,
    aktion: "handler_aufgerufen" as const,
    aktion_payload: { handler_slug: eingabe.handlerSlug, anliegen_id: eingabe.anliegenId, status: eingabe.resultatStatus },
  };
}

/**
 * freigegeben_durch ist immer der übergebene nutzerId (die tatsächlich
 * handelnde, per auth.uid() bestimmte Person) -- kein Aufrufer kann hier
 * eine andere Person einsetzen. Kein "versendet_at" oder ähnliches Feld:
 * "freigegeben" heißt "bereit zum Versand", nicht "versendet".
 */
export function handlerFreigebenPayload(nutzerId: string) {
  return { freigegeben_at: new Date().toISOString(), freigegeben_durch: nutzerId };
}

export function auditLogFreigabePayload(eingabe: {
  agenturId: string;
  vorgangId: string;
  nutzerId: string;
  typ: "handler_ergebnis" | "rueckfrage";
  handlerAufrufId?: string;
}) {
  return {
    agentur_id: eingabe.agenturId,
    vorgang_id: eingabe.vorgangId,
    nutzer_id: eingabe.nutzerId,
    aktion: "freigabe_erteilt" as const,
    aktion_payload:
      eingabe.typ === "handler_ergebnis"
        ? { typ: eingabe.typ, handler_aufruf_id: eingabe.handlerAufrufId }
        : { typ: eingabe.typ },
  };
}

export function rueckfrageSendenPayload(text: string, nutzerId: string) {
  return {
    rueckfrage_nachricht: text,
    rueckfrage_bereit_am: new Date().toISOString(),
    rueckfrage_freigegeben_durch: nutzerId,
  };
}
