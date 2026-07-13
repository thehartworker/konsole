import { describe, expect, it } from "vitest";
import type { FuehreW1AusResultat } from "@konsole/persistence";
import {
  auditLogFreigabePayload,
  auditLogHandlerAufgerufenPayload,
  handlerAufrufAbschliessenPayload,
  handlerAufrufEinfuegenPayload,
  handlerFreigebenPayload,
  rueckfrageSendenPayload,
} from "@/lib/freigabe-payloads";

// Issue #43, SCOPE-GRENZE: "Handler auslösen" erzeugt nur einen Entwurf,
// "freigeben"/"Rückfrage senden" setzen nur einen Status -- keiner der drei
// Payloads darf ein Feld enthalten, das einen echten Versand auslösen
// könnte (der Versand-Kanal existiert in v1 nicht).

function keinVersandFeld(payload: Record<string, unknown>) {
  const keys = Object.keys(payload).join(" ").toLowerCase();
  expect(keys).not.toMatch(/versand|gesendet|send/);
}

describe("handlerAufrufEinfuegenPayload", () => {
  it("setzt status immer auf in_progress und enthält kein Versand-Feld", () => {
    const payload = handlerAufrufEinfuegenPayload({
      vorgangId: "vorgang-1",
      anliegenId: "anliegen-1",
      agenturId: "agentur-1",
      kundeId: "kunde-1",
      handlerSlug: "W1_pressemitteilung_drafter",
      input: { anlass: "Test" },
      zustaendigeNutzerId: "nutzer-1",
      prioritaet: "hoch",
    });

    expect(payload.status).toBe("in_progress");
    expect(payload.vorgang_id).toBe("vorgang-1");
    expect(payload.zustaendige_nutzer_id).toBe("nutzer-1");
    expect(() => new Date(payload.gestartet_at).toISOString()).not.toThrow();
    keinVersandFeld(payload);
  });
});

describe("handlerAufrufAbschliessenPayload", () => {
  it("speichert bei Erfolg das Ergebnis mit status done, kein Versand-Feld", () => {
    const erfolgResultat = { status: "erfolg", output: { headline: "Test" } } as unknown as FuehreW1AusResultat;
    const payload = handlerAufrufAbschliessenPayload(erfolgResultat);
    expect(payload.status).toBe("done");
    expect((payload as { ergebnis: unknown }).ergebnis).toEqual({ headline: "Test" });
    keinVersandFeld(payload);
  });

  it("speichert bei Fehlschlag den Fehlertext mit status failed, kein Versand-Feld", () => {
    const payload = handlerAufrufAbschliessenPayload({ status: "fehlgeschlagen", fehler: "LLM-Fehler" });
    expect(payload.status).toBe("failed");
    expect((payload as { fehler: string }).fehler).toBe("LLM-Fehler");
    keinVersandFeld(payload);
  });
});

describe("handlerFreigebenPayload", () => {
  it("setzt freigegeben_durch auf die übergebene, tatsächlich handelnde Person", () => {
    const payload = handlerFreigebenPayload("nutzer-42");
    expect(payload.freigegeben_durch).toBe("nutzer-42");
    expect(() => new Date(payload.freigegeben_at).toISOString()).not.toThrow();
    keinVersandFeld(payload);
  });
});

describe("rueckfrageSendenPayload", () => {
  it("markiert nur 'bereit zum Versand', löst aber selbst keinen Versand aus", () => {
    const payload = rueckfrageSendenPayload("Kurze Rückfrage an den Absender.", "nutzer-7");
    expect(payload.rueckfrage_nachricht).toBe("Kurze Rückfrage an den Absender.");
    expect(payload.rueckfrage_freigegeben_durch).toBe("nutzer-7");
    expect(() => new Date(payload.rueckfrage_bereit_am).toISOString()).not.toThrow();
    keinVersandFeld(payload);
  });
});

describe("audit_log-Payloads", () => {
  it("protokolliert den Handler-Aufruf mit Handler-Slug, Anliegen und Ergebnis-Status", () => {
    const payload = auditLogHandlerAufgerufenPayload({
      agenturId: "agentur-1",
      vorgangId: "vorgang-1",
      nutzerId: "nutzer-1",
      handlerSlug: "W2_presseanfragen_drafter",
      anliegenId: "anliegen-1",
      resultatStatus: "erfolg",
    });
    expect(payload.aktion).toBe("handler_aufgerufen");
    expect(payload.aktion_payload).toEqual({
      handler_slug: "W2_presseanfragen_drafter",
      anliegen_id: "anliegen-1",
      status: "erfolg",
    });
  });

  it("unterscheidet Handler-Ergebnis- und Rückfrage-Freigabe im Payload-Typ", () => {
    const handlerFreigabe = auditLogFreigabePayload({
      agenturId: "a",
      vorgangId: "v",
      nutzerId: "n",
      typ: "handler_ergebnis",
      handlerAufrufId: "h-1",
    });
    expect(handlerFreigabe.aktion).toBe("freigabe_erteilt");
    expect(handlerFreigabe.aktion_payload).toEqual({ typ: "handler_ergebnis", handler_aufruf_id: "h-1" });

    const rueckfrageFreigabe = auditLogFreigabePayload({ agenturId: "a", vorgangId: "v", nutzerId: "n", typ: "rueckfrage" });
    expect(rueckfrageFreigabe.aktion_payload).toEqual({ typ: "rueckfrage" });
  });
});
