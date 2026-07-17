import { describe, expect, it } from "vitest";
import { formatiereDatum, kernFeldProvenanceText, listenzeileProvenanceText } from "@/lib/kundenprofil-provenance";

// Issue #50, Aufgabe E: "Jedes Feld/jede Zeile mit feld_status !== 'freigegeben'
// ODER mit herkunft IS NOT NULL zeigt eine dezente Herkunfts-Zeile ... /
// Freigegebene Werte ohne besondere Herkunft ... haben keine Herkunfts-Zeile."

describe("formatiereDatum", () => {
  it("wandelt ein ISO-Datum ins deutsche Format um", () => {
    expect(formatiereDatum("2026-07-17")).toBe("17.07.2026");
  });

  it("kürzt einen vollen ISO-Zeitstempel vor der Umwandlung", () => {
    expect(formatiereDatum("2026-07-17T12:34:56.000Z")).toBe("17.07.2026");
  });
});

describe("kernFeldProvenanceText", () => {
  it("zeigt keine Zeile für freigegeben ohne Quelle (manuell erfasst und freigegeben)", () => {
    expect(kernFeldProvenanceText({ status: "freigegeben", quelle: null, stand: "2026-07-10" })).toBeNull();
  });

  it("zeigt keine Zeile, wenn gar kein feld_status-Eintrag existiert", () => {
    expect(kernFeldProvenanceText(undefined)).toBeNull();
  });

  it("zeigt eine Zeile für vorläufig ohne Quelle", () => {
    const text = kernFeldProvenanceText({ status: "vorlaeufig", quelle: null, stand: "2026-07-12" });
    expect(text).toContain("vorläufig eingetragen");
    expect(text).toContain("12.07.2026");
    expect(text).toContain("wartet auf Freigabe");
  });

  it("zeigt eine Zeile für abgeleitet aus einem Dokument", () => {
    const text = kernFeldProvenanceText({ status: "abgeleitet", quelle: "dokument-upload", stand: "2026-07-17" });
    expect(text).toBe("abgeleitet aus einem Dokument, extrahiert am 17.07.2026");
  });

  it("zeigt eine Zeile für abgeleitet aus einer Website", () => {
    const text = kernFeldProvenanceText({ status: "abgeleitet", quelle: "website-scraping", stand: "2026-07-17" });
    expect(text).toBe("abgeleitet aus einer Website, extrahiert am 17.07.2026");
  });

  it("bleibt sichtbar mit Hinweis, wenn ein abgeleiteter Wert später freigegeben wurde", () => {
    const text = kernFeldProvenanceText({ status: "freigegeben", quelle: "dokument-upload", stand: "2026-07-17" });
    expect(text).toContain("abgeleitet aus einem Dokument");
    expect(text).toContain("mittlerweile freigegeben");
  });
});

describe("listenzeileProvenanceText", () => {
  it("zeigt keine Zeile für freigegeben ohne Herkunft", () => {
    expect(listenzeileProvenanceText({ status: "freigegeben", herkunft: null, updated_at: "2026-07-01T00:00:00Z" })).toBeNull();
  });

  it("zeigt eine Zeile für vorläufig ohne Herkunft, mit Datum aus updated_at", () => {
    const text = listenzeileProvenanceText({ status: "vorlaeufig", herkunft: null, updated_at: "2026-07-12T09:00:00Z" });
    expect(text).toBe("vorläufig eingetragen am 12.07.2026, wartet auf Freigabe");
  });

  it("zeigt eine Zeile für vorläufig ohne Datum (updated_at fehlt)", () => {
    const text = listenzeileProvenanceText({ status: "vorlaeufig", herkunft: null });
    expect(text).toBe("vorläufig eingetragen, wartet auf Freigabe");
  });

  it("zeigt eine Zeile für abgeleitet aus einer Website mit Datum", () => {
    const text = listenzeileProvenanceText({ status: "abgeleitet", herkunft: "website-scraping", updated_at: "2026-07-17T10:00:00Z" });
    expect(text).toBe("abgeleitet aus einer Website, extrahiert am 17.07.2026");
  });
});
