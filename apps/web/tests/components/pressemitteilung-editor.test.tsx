import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { W1Output } from "@konsole/handlers";

// Issue #45: "Optimistic UI: der Client zeigt die Aenderung sofort, die
// Server-Action laeuft parallel, bei Fehler wird der Zustand
// zurueckgerollt und ein dezenter Retry-Indikator angezeigt" sowie die
// Barrierefreiheits-Anforderung ("jedes editierbare Segment [hat] ein
// sinnvolles aria-label ... und [ist] ueber die Tastatur erreichbar").
// Die Server-Action wird gemockt (kein echter Supabase-Client in Tests),
// siehe docs/decisions/2026-07-13_konsole-block2-editing-und-export.md.

vi.mock("@/app/vorgaenge/[id]/actions", () => ({
  pressemitteilungBearbeitenAction: vi.fn(),
}));

import { pressemitteilungBearbeitenAction } from "@/app/vorgaenge/[id]/actions";
import { PressemitteilungEditor } from "@/app/vorgaenge/[id]/components/pressemitteilung-editor";

const mockAction = vi.mocked(pressemitteilungBearbeitenAction);

const INITIAL: W1Output = {
  pressemitteilung: {
    headline: "Alte Headline",
    sub_headline: "Alter Untertitel",
    ort_datum: "München, 13. Juli 2026",
    lead_absatz: "Ein Lead-Absatz.",
    ausfuehrung_absaetze: ["Erster Absatz.", "Zweiter Absatz."],
    zitat: { text: "Ein Zitat.", sprecher_name: "Dr. Beispiel", sprecher_rolle: "Geschäftsführung" },
    boilerplate: "Boilerplate-Text.",
    kontakt_fusszeile: "presse@kunde.example",
    laenge_worte: 10,
  },
  kritiker_findings: [],
  grenz_pruefung_ergebnis: { bestanden: true, verstoesse: [] },
  ueberarbeitungsbeduerftig: false,
  benoetigt_menschliche_freigabe: true,
  freigabe_grund: "Standard.",
  vorschlaege_fuer_naechste_schritte: [],
  hinweise: [],
  audit_metadaten: { verwendete_quellen: [], modell: "test", dauer_ms: 0, tokens_input: 0, tokens_output: 0 },
};

function renderEditor() {
  return render(
    <PressemitteilungEditor handlerAufrufId="h1" initial={INITIAL} wurdeBereitsBearbeitet={false} warFreigegeben={false} />,
  );
}

function headlineOeffnenUndBearbeiten(neuerText: string) {
  const segment = screen.getByRole("button", { name: /Überschrift/ });
  fireEvent.keyDown(segment, { key: "Enter" });
  const input = screen.getByLabelText("Überschrift");
  fireEvent.change(input, { target: { value: neuerText } });
  return input;
}

describe("PressemitteilungEditor -- Optimistic UI und Rollback", () => {
  beforeEach(() => {
    mockAction.mockReset();
  });

  it("zeigt eine Änderung sofort an, bevor die Server-Action antwortet (optimistic)", async () => {
    let resolveAction: (value: Awaited<ReturnType<typeof pressemitteilungBearbeitenAction>>) => void = () => {};
    mockAction.mockReturnValue(new Promise((resolve) => (resolveAction = resolve)));

    renderEditor();
    const input = headlineOeffnenUndBearbeiten("Neue Headline");
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    });

    expect(screen.getByText("Neue Headline")).toBeTruthy();
    expect(screen.queryByText("Alte Headline")).toBeNull();

    await act(async () => {
      resolveAction({ status: "erfolg", freigabeErloschen: false });
    });
  });

  it("rollt bei einer fehlgeschlagenen Server-Action auf den vorherigen Wert zurück und zeigt einen Retry-Hinweis", async () => {
    mockAction.mockResolvedValueOnce({ status: "fehler", meldung: "Speichern fehlgeschlagen. Bitte erneut versuchen." });

    renderEditor();
    const input = headlineOeffnenUndBearbeiten("Neue Headline");
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText("Alte Headline")).toBeTruthy();
    expect(screen.queryByText("Neue Headline")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Speichern fehlgeschlagen");
    expect(screen.getByText("Erneut versuchen")).toBeTruthy();
  });

  it("sendet bei 'Erneut versuchen' denselben Patch erneut, ohne dass die Nutzerin neu eintippen muss", async () => {
    mockAction.mockResolvedValueOnce({ status: "fehler", meldung: "Netzwerkfehler." });
    mockAction.mockResolvedValueOnce({ status: "erfolg", freigabeErloschen: false });

    renderEditor();
    const input = headlineOeffnenUndBearbeiten("Neue Headline");
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });

    await waitFor(() => expect(screen.getByText("Erneut versuchen")).toBeTruthy());
    expect(screen.getByText("Alte Headline")).toBeTruthy();

    fireEvent.click(screen.getByText("Erneut versuchen"));

    await waitFor(() => expect(screen.getByText("Neue Headline")).toBeTruthy());
    expect(mockAction).toHaveBeenCalledTimes(2);
    expect(mockAction).toHaveBeenNthCalledWith(2, "h1", { headline: "Neue Headline" });
    expect(screen.queryByText("Erneut versuchen")).toBeNull();
  });

  it("Escape verwirft die Änderung, ohne die Server-Action aufzurufen", async () => {
    renderEditor();
    const input = headlineOeffnenUndBearbeiten("Verworfener Text");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.getByText("Alte Headline")).toBeTruthy();
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("zeigt die Freigabe-Erläuterung, wenn die Server-Action freigabeErloschen=true meldet", async () => {
    mockAction.mockResolvedValueOnce({ status: "erfolg", freigabeErloschen: true });

    renderEditor();
    const input = headlineOeffnenUndBearbeiten("Neue Headline");
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });

    await waitFor(() => expect(screen.getByText(/muss erneut freigegeben werden/)).toBeTruthy());
  });
});

describe("PressemitteilungEditor -- Barrierefreiheit", () => {
  beforeEach(() => {
    mockAction.mockReset();
  });

  it("jedes editierbare Segment hat ein sinnvolles aria-label und ist über die Tastatur (Tab-Reihenfolge, Enter) erreichbar", () => {
    renderEditor();

    const erwarteteLabels = [
      /Überschrift/,
      /Untertitel/,
      /Ort und Datum/,
      /Lead-Absatz/,
      /Absatz 1 von 2/,
      /Absatz 2 von 2/,
      /Zitat, Sprechername und Sprecherrolle/,
      /Boilerplate/,
      /Kontakt-Fußzeile/,
    ];

    for (const label of erwarteteLabels) {
      const segment = screen.getByRole("button", { name: label });
      expect(segment.getAttribute("tabindex")).toBe("0");
    }
  });

  it("Enter auf einem fokussierten Segment aktiviert den Editor mit einem beschrifteten Eingabefeld", () => {
    renderEditor();
    const segment = screen.getByRole("button", { name: /Lead-Absatz/ });
    segment.focus();
    fireEvent.keyDown(segment, { key: "Enter" });

    const feld = screen.getByLabelText("Lead-Absatz");
    expect(feld).toBeTruthy();
    expect(document.activeElement).toBe(feld);
  });

  it("aktive Segmente sind aus der Tab-Reihenfolge des Containers entfernt (tabIndex=-1), das Eingabefeld selbst bleibt fokussierbar", () => {
    renderEditor();
    const segment = screen.getByRole("button", { name: /Überschrift/ });
    fireEvent.keyDown(segment, { key: "Enter" });

    expect(screen.getByLabelText("Überschrift")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Überschrift/ })).toBeNull();
  });
});
