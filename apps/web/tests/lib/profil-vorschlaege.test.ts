import { describe, expect, it } from "vitest";
import type { ProfilExtraktionsVorschlag } from "@konsole/profil-extraktion";
import { vorschlaegeAusExtraktion } from "@/lib/profil-vorschlaege";

// Issue #50, Aufgabe C: Vorschläge werden dem ProfilExtraktionsVorschlagSchema
// entsprechend gerendert und pro Feld/Zeile korrekt einer der fünf Sektionen
// zugeordnet.

const LEERER_VORSCHLAG: ProfilExtraktionsVorschlag = {
  fakten: { rechtsform: null, sitz: null, geschaeftsbeschreibung: null },
  stimme: { grundton: null, anrede_konvention: null, gendering_konvention: null, zielsprache_absender_texte: null },
  strategie: { positionierung: null, usp: null },
  boilerplate: [],
  kennzahlen: [],
  sprecher: [],
  kernbotschaften: [],
  themen: [],
  grenzen: [],
  medien_kontext: [],
  unklare_hinweise: [],
};

describe("vorschlaegeAusExtraktion", () => {
  it("liefert eine leere Liste für einen komplett leeren Vorschlag", () => {
    expect(vorschlaegeAusExtraktion(LEERER_VORSCHLAG, "dokument-upload", "test.pdf", "2026-07-17")).toEqual([]);
  });

  it("wandelt nicht-null Kern-Felder in Karten der richtigen Sektion um, null-Felder werden übersprungen", () => {
    const vorschlag: ProfilExtraktionsVorschlag = {
      ...LEERER_VORSCHLAG,
      fakten: { rechtsform: "GmbH", sitz: null, geschaeftsbeschreibung: "Eine Beispiel-Agentur." },
      strategie: { positionierung: "Marktführer im Segment.", usp: null },
    };

    const karten = vorschlaegeAusExtraktion(vorschlag, "dokument-upload", "Broschüre.pdf", "2026-07-17");

    const rechtsform = karten.find((k) => k.id === "kern:rechtsform");
    expect(rechtsform?.sektion).toBe("fakten");
    expect(rechtsform?.wertAnzeige).toBe("GmbH");
    expect(rechtsform?.ziel).toEqual({ art: "kern", feldname: "rechtsform" });

    expect(karten.find((k) => k.id === "kern:sitz")).toBeUndefined();

    const positionierung = karten.find((k) => k.id === "kern:positionierung");
    expect(positionierung?.sektion).toBe("strategie");
    expect(karten.find((k) => k.id === "kern:usp")).toBeUndefined();
  });

  it("ordnet Listen-Vorschläge der richtigen Sektion und Tabelle zu", () => {
    const vorschlag: ProfilExtraktionsVorschlag = {
      ...LEERER_VORSCHLAG,
      kernbotschaften: [
        { text: "Wir sind verlässlich.", reihenfolge: 1 },
        { text: "Wir sind schnell.", reihenfolge: 2 },
      ],
      grenzen: [{ typ: "no_go_thema", inhalt: "Politische Stellungnahmen", textart_geltungsbereich: null }],
    };

    const karten = vorschlaegeAusExtraktion(vorschlag, "website-scraping", "kunde.example", "2026-07-17");

    const kernbotschaften = karten.filter((k) => k.ziel.art === "liste" && k.ziel.tabelle === "kunden_kernbotschaften");
    expect(kernbotschaften).toHaveLength(2);
    expect(kernbotschaften.map((k) => k.wertAnzeige)).toEqual(["Wir sind verlässlich.", "Wir sind schnell."]);
    expect(kernbotschaften[0].sektion).toBe("strategie");

    const grenzen = karten.filter((k) => k.ziel.art === "liste" && k.ziel.tabelle === "kunden_grenzen");
    expect(grenzen).toHaveLength(1);
    expect(grenzen[0].sektion).toBe("grenzen_und_governance");
    expect(grenzen[0].ziel).toMatchObject({
      art: "liste",
      tabelle: "kunden_grenzen",
      zeile: { ist_deterministisch_erzwungen: false },
    });
  });

  it("verwirft Kennzahlen ohne Stichtag oder Quelle (Konservativ-Prinzip greift bereits vor der Kartenerzeugung)", () => {
    const vorschlag: ProfilExtraktionsVorschlag = {
      ...LEERER_VORSCHLAG,
      kennzahlen: [
        { bezeichnung: "Mitarbeitende", wert: "42", stichtag: "2026-01-01", quelle: "HR-System" },
        { bezeichnung: "Umsatz", wert: "1 Mio.", stichtag: null, quelle: null },
      ],
    };

    const karten = vorschlaegeAusExtraktion(vorschlag, "dokument-upload", "Bericht.pdf", "2026-07-17");
    const kennzahlen = karten.filter((k) => k.ziel.art === "liste" && k.ziel.tabelle === "kunden_kennzahlen");
    expect(kennzahlen).toHaveLength(1);
    expect(kennzahlen[0].wertAnzeige).toBe("Mitarbeitende: 42");
  });

  it("trägt Quelle, Quellenbezeichnung und Stand auf jeder Karte durch", () => {
    const vorschlag: ProfilExtraktionsVorschlag = { ...LEERER_VORSCHLAG, fakten: { ...LEERER_VORSCHLAG.fakten, rechtsform: "AG" } };
    const [karte] = vorschlaegeAusExtraktion(vorschlag, "dokument-upload", "Handelsregisterauszug.pdf", "2026-07-17");
    expect(karte.quelle).toBe("dokument-upload");
    expect(karte.quelleBezeichnung).toBe("Handelsregisterauszug.pdf");
    expect(karte.stand).toBe("2026-07-17");
  });
});
