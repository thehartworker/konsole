import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { HandlerAufrufZeile } from "@/lib/vorgaenge";
import { CompliancePanel } from "@/app/vorgaenge/[id]/components/compliance-panel";

// Issue #43: "Verstöße gegen deterministische Grenzen ... müssen DEUTLICH
// und rot dargestellt werden, nicht in einem Log versteckt." Dieser Test
// beweist, dass ein Grenz-Verstoß und ein hoch eingestufter
// Kritiker-Finding tatsächlich im gerenderten Ergebnis auftauchen (nicht
// nur in Rohdaten).

const W1_MIT_VERSTOSS: HandlerAufrufZeile = {
  id: "handler-1",
  vorgang_id: "vorgang-1",
  anliegen_id: "anliegen-1",
  handler_slug: "W1_pressemitteilung_drafter",
  status: "done",
  fehler: null,
  freigegeben_at: null,
  freigegeben_durch: null,
  ergebnis: {
    pressemitteilung: {
      headline: "Test-Headline",
      sub_headline: null,
      ort_datum: "München, 13. Juli 2026",
      lead_absatz: "Lead.",
      ausfuehrung_absaetze: ["Absatz."],
      zitat: null,
      boilerplate: "Boilerplate.",
      kontakt_fusszeile: "Kontakt.",
      laenge_worte: 10,
    },
    kritiker_findings: [
      { schweregrad: "hoch", finding: "Unbelegte Wirkaussage im Text.", empfehlung: "Beleg ergänzen oder Aussage streichen." },
      { schweregrad: "niedrig", finding: "Stilistische Kleinigkeit.", empfehlung: "Optional anpassen." },
    ],
    grenz_pruefung_ergebnis: {
      bestanden: false,
      verstoesse: [
        { regel_id: null, baustein_name: "kundengrenze_verbotene_aussage", quelle: "code", begruendung: 'Verbotene Aussage laut Kundenprofil-Grenze gefunden: "heilt garantiert".' },
      ],
    },
    ueberarbeitungsbeduerftig: true,
    benoetigt_menschliche_freigabe: true,
    freigabe_grund: "Grenz-Verstoß erkannt.",
    vorschlaege_fuer_naechste_schritte: [],
    hinweise: [],
    audit_metadaten: { verwendete_quellen: [], modell: "test", dauer_ms: 0, tokens_input: 0, tokens_output: 0 },
  },
};

describe("CompliancePanel", () => {
  it("zeigt Grenz-Verstöße und hoch eingestufte Kritiker-Findings deutlich (rot) an", () => {
    render(<CompliancePanel handlerAufrufe={[W1_MIT_VERSTOSS]} />);

    const verstoss = screen.getByText(/Verbotene Aussage laut Kundenprofil-Grenze/);
    expect(verstoss).toBeTruthy();
    expect(verstoss.closest("div")?.className).toContain("text-danger");

    const finding = screen.getByText(/Unbelegte Wirkaussage im Text\./);
    expect(finding).toBeTruthy();
    expect(finding.closest("div")?.className).toContain("text-danger");

    expect(screen.queryByText(/Stilistische Kleinigkeit\./)).toBeNull();
  });

  it("zeigt den Shadow-Mode-Hinweis immer an, auch ohne Verstöße", () => {
    render(<CompliancePanel handlerAufrufe={[]} />);
    expect(screen.getByText(/Shadow-Mode aktiv/)).toBeTruthy();
    expect(screen.getByText(/Keine Grenz-Verstöße oder hoch eingestuften Kritiker-Findings\./)).toBeTruthy();
  });
});
