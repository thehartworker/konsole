import { describe, expect, it } from "vitest";
import type { W1Output } from "@konsole/handlers";
import { berechneLaengeWorte, pressemitteilungPatchAnwenden } from "@/lib/pressemitteilung-patch";

const BASIS: W1Output = {
  pressemitteilung: {
    headline: "Alte Headline",
    sub_headline: "Alter Untertitel",
    ort_datum: "München, 13. Juli 2026",
    lead_absatz: "Alter Lead-Absatz mit fünf Worten.",
    ausfuehrung_absaetze: ["Erster Absatz.", "Zweiter Absatz."],
    zitat: { text: "Altes Zitat.", sprecher_name: "Alt Name", sprecher_rolle: "Alte Rolle" },
    boilerplate: "Alte Boilerplate.",
    kontakt_fusszeile: "alt@kunde.example",
    laenge_worte: 42,
  },
  kritiker_findings: [{ schweregrad: "niedrig", finding: "x", empfehlung: "y" }],
  grenz_pruefung_ergebnis: { bestanden: true, verstoesse: [] },
  ueberarbeitungsbeduerftig: false,
  benoetigt_menschliche_freigabe: true,
  freigabe_grund: "Standard-Freigabe.",
  vorschlaege_fuer_naechste_schritte: [],
  hinweise: [],
  audit_metadaten: { verwendete_quellen: [], modell: "test", dauer_ms: 0, tokens_input: 0, tokens_output: 0 },
};

describe("berechneLaengeWorte", () => {
  it("zählt Worte aus lead_absatz und ausfuehrung_absaetze zusammen", () => {
    expect(berechneLaengeWorte("Ein kurzer Satz.", ["Noch ein Satz."])).toBe(6);
  });

  it("ignoriert mehrfache Leerzeichen", () => {
    expect(berechneLaengeWorte("Ein   Satz", [])).toBe(2);
  });
});

describe("pressemitteilungPatchAnwenden", () => {
  it("überschreibt nur die im Patch enthaltenen Felder", () => {
    const ergebnis = pressemitteilungPatchAnwenden(BASIS, { headline: "Neue Headline" });
    expect(ergebnis.pressemitteilung.headline).toBe("Neue Headline");
    expect(ergebnis.pressemitteilung.sub_headline).toBe("Alter Untertitel");
    expect(ergebnis.pressemitteilung.lead_absatz).toBe(BASIS.pressemitteilung.lead_absatz);
  });

  it("lässt alle anderen Top-Level-Felder von W1Output unverändert", () => {
    const ergebnis = pressemitteilungPatchAnwenden(BASIS, { headline: "Neu" });
    expect(ergebnis.kritiker_findings).toBe(BASIS.kritiker_findings);
    expect(ergebnis.grenz_pruefung_ergebnis).toBe(BASIS.grenz_pruefung_ergebnis);
    expect(ergebnis.audit_metadaten).toBe(BASIS.audit_metadaten);
  });

  it("erlaubt das Entfernen von sub_headline und zitat (null)", () => {
    const ergebnis = pressemitteilungPatchAnwenden(BASIS, { sub_headline: null, zitat: null });
    expect(ergebnis.pressemitteilung.sub_headline).toBeNull();
    expect(ergebnis.pressemitteilung.zitat).toBeNull();
  });

  it("berechnet laenge_worte neu, wenn lead_absatz sich ändert", () => {
    const ergebnis = pressemitteilungPatchAnwenden(BASIS, { lead_absatz: "Kurz." });
    expect(ergebnis.pressemitteilung.laenge_worte).toBe(berechneLaengeWorte("Kurz.", BASIS.pressemitteilung.ausfuehrung_absaetze));
  });

  it("berechnet laenge_worte neu, wenn ausfuehrung_absaetze sich ändert", () => {
    const neueAbsaetze = ["Nur ein Absatz."];
    const ergebnis = pressemitteilungPatchAnwenden(BASIS, { ausfuehrung_absaetze: neueAbsaetze });
    expect(ergebnis.pressemitteilung.laenge_worte).toBe(berechneLaengeWorte(BASIS.pressemitteilung.lead_absatz, neueAbsaetze));
  });

  it("lässt laenge_worte unverändert, wenn weder lead_absatz noch ausfuehrung_absaetze im Patch sind", () => {
    const ergebnis = pressemitteilungPatchAnwenden(BASIS, { headline: "Neu" });
    expect(ergebnis.pressemitteilung.laenge_worte).toBe(42);
  });

  it("original bleibt unverändert (kein Mutation-Bug)", () => {
    pressemitteilungPatchAnwenden(BASIS, { headline: "Neu", zitat: null });
    expect(BASIS.pressemitteilung.headline).toBe("Alte Headline");
    expect(BASIS.pressemitteilung.zitat).not.toBeNull();
  });
});
