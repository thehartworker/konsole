import { describe, expect, it } from "vitest";
import type { W1Output } from "@konsole/handlers";
import { FakeHandlerAufrufRepository } from "@konsole/persistence/testing";
import { pressemitteilungBearbeiten } from "@/lib/pressemitteilung-bearbeiten";

// Issue #45: "Server-Action pressemitteilungBearbeiten validiert Zod, ruft
// Repository, gibt bei Zod-Fehler klaren Fehler zurueck (Client kann den
// Zustand zurueckrollen)" -- und der Freigabe-Erläuterung-Semantik-Test auf
// Server-Action-Ebene. Getestet gegen den testbaren Kern
// (src/lib/pressemitteilung-bearbeiten.ts), nicht gegen die Server-Action
// selbst -- die lädt/schreibt über den echten Supabase-Client und ist damit
// bewusst nur noch Verkabelung, siehe deren Kommentar in actions.ts.

const BASIS: W1Output = {
  pressemitteilung: {
    headline: "Alte Headline",
    sub_headline: null,
    ort_datum: "München, 13. Juli 2026",
    lead_absatz: "Ein Lead-Absatz.",
    ausfuehrung_absaetze: ["Ein Absatz."],
    zitat: null,
    boilerplate: "Boilerplate.",
    kontakt_fusszeile: "Kontakt.",
    laenge_worte: 10,
  },
  kritiker_findings: [],
  grenz_pruefung_ergebnis: { bestanden: true, verstoesse: [] },
  ueberarbeitungsbeduerftig: false,
  benoetigt_menschliche_freigabe: true,
  freigabe_grund: "Standard-Freigabe.",
  vorschlaege_fuer_naechste_schritte: [],
  hinweise: [],
  audit_metadaten: { verwendete_quellen: [], modell: "test", dauer_ms: 0, tokens_input: 0, tokens_output: 0 },
};

describe("pressemitteilungBearbeiten", () => {
  it("führt den Patch zusammen und schreibt über das Repository", async () => {
    const repo = new FakeHandlerAufrufRepository({
      handlerAufrufe: [{ id: "h1", ergebnis_bearbeitet: null, freigegeben_at: null, bearbeitet_at: null }],
    });

    const resultat = await pressemitteilungBearbeiten(repo, "h1", BASIS, { headline: "Neue Headline" });

    expect(resultat).toEqual({ status: "erfolg", freigabeErloschen: false });
    const gespeichert = repo.handlerAufrufe.get("h1")?.ergebnis_bearbeitet as W1Output;
    expect(gespeichert.pressemitteilung.headline).toBe("Neue Headline");
    expect(gespeichert.pressemitteilung.lead_absatz).toBe(BASIS.pressemitteilung.lead_absatz);
  });

  it("meldet freigabeErloschen=true, wenn die Zeile zuvor freigegeben war", async () => {
    const repo = new FakeHandlerAufrufRepository({
      handlerAufrufe: [{ id: "h1", ergebnis_bearbeitet: null, freigegeben_at: "2026-07-13T10:00:00Z", bearbeitet_at: null }],
    });

    const resultat = await pressemitteilungBearbeiten(repo, "h1", BASIS, { headline: "Neu" });

    expect(resultat).toEqual({ status: "erfolg", freigabeErloschen: true });
  });

  it("meldet freigabeErloschen=false, wenn die Zeile vorher nicht freigegeben war", async () => {
    const repo = new FakeHandlerAufrufRepository({
      handlerAufrufe: [{ id: "h1", ergebnis_bearbeitet: null, freigegeben_at: null, bearbeitet_at: null }],
    });

    const resultat = await pressemitteilungBearbeiten(repo, "h1", BASIS, { headline: "Neu" });

    expect(resultat).toEqual({ status: "erfolg", freigabeErloschen: false });
  });

  it("gibt bei einem Zod-Fehler eine klare Fehlermeldung zurück und schreibt NICHT", async () => {
    const repo = new FakeHandlerAufrufRepository({
      handlerAufrufe: [{ id: "h1", ergebnis_bearbeitet: null, freigegeben_at: null, bearbeitet_at: null }],
    });

    // headline: "" verletzt PressemitteilungSchema (min(1)).
    const resultat = await pressemitteilungBearbeiten(repo, "h1", BASIS, { headline: "" });

    expect(resultat.status).toBe("fehler");
    expect(resultat.status === "fehler" && resultat.meldung).toContain("ungültig");
    expect(repo.handlerAufrufe.get("h1")?.ergebnis_bearbeitet).toBeNull();
  });

  it("erlaubt das Entfernen von sub_headline/zitat über null", async () => {
    const repo = new FakeHandlerAufrufRepository({
      handlerAufrufe: [{ id: "h1", ergebnis_bearbeitet: null, freigegeben_at: null, bearbeitet_at: null }],
    });
    const mitZitat: W1Output = { ...BASIS, pressemitteilung: { ...BASIS.pressemitteilung, sub_headline: "x", zitat: { text: "t", sprecher_name: "n", sprecher_rolle: "r" } } };

    const resultat = await pressemitteilungBearbeiten(repo, "h1", mitZitat, { sub_headline: null, zitat: null });

    expect(resultat.status).toBe("erfolg");
    const gespeichert = repo.handlerAufrufe.get("h1")?.ergebnis_bearbeitet as W1Output;
    expect(gespeichert.pressemitteilung.sub_headline).toBeNull();
    expect(gespeichert.pressemitteilung.zitat).toBeNull();
  });
});
