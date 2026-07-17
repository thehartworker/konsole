import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

// Issue #50, Tests: "Vitest-Component-Tests für die Vorschlags-Karten:
// Übernehmen schreibt in Repository als abgeleitet, Ablehnen entfernt die
// Karte, Undo innerhalb 15s reversibel" plus Barrierefreiheit ("Vorschlags-
// Karten ... über die Tastatur erreichbar mit sinnvollen aria-label").

vi.mock("@/app/kunden/[id]/profil/actions", () => ({
  uebernehmeVorschlagAction: vi.fn(),
  verwerfeVorschlagAction: vi.fn(),
}));

import { uebernehmeVorschlagAction, verwerfeVorschlagAction } from "@/app/kunden/[id]/profil/actions";
import { VorschlaegePanel } from "@/app/kunden/[id]/profil/components/vorschlaege-panel";
import type { Vorschlag } from "@/lib/profil-vorschlaege";

const mockUebernehmen = vi.mocked(uebernehmeVorschlagAction);
const mockVerwerfen = vi.mocked(verwerfeVorschlagAction);

const VORSCHLAG_A: Vorschlag = {
  id: "kern:rechtsform",
  sektion: "fakten",
  sektionsLabel: "Fakten",
  feldLabel: "Rechtsform",
  wertAnzeige: "GmbH",
  ziel: { art: "kern", feldname: "rechtsform" },
  quelle: "dokument-upload",
  quelleBezeichnung: "Broschüre.pdf",
  stand: "17.07.2026",
};

const VORSCHLAG_B: Vorschlag = {
  id: "kunden_kernbotschaften:0",
  sektion: "strategie",
  sektionsLabel: "Strategie",
  feldLabel: "Kernbotschaft",
  wertAnzeige: "Wir sind verlässlich.",
  ziel: { art: "liste", tabelle: "kunden_kernbotschaften", zeile: { text: "Wir sind verlässlich.", reihenfolge: 1 } },
  quelle: "dokument-upload",
  quelleBezeichnung: "Broschüre.pdf",
  stand: "17.07.2026",
};

function TestHarness({ initial, onUebernommen }: { initial: Vorschlag[]; onUebernommen?: (v: Vorschlag, id?: string) => void }) {
  const [vorschlaege, setVorschlaege] = useState(initial);
  return (
    <VorschlaegePanel
      kundeId="kunde-1"
      vorschlaege={vorschlaege}
      quelleBezeichnung="Broschüre.pdf"
      erstelltAm="17.07.2026"
      unklareHinweise={[]}
      onVorschlaegeGeaendert={(neuOderUpdater) =>
        setVorschlaege((bisherig) => (typeof neuOderUpdater === "function" ? neuOderUpdater(bisherig) : neuOderUpdater))
      }
      onUebernommen={(vorschlag, id) => onUebernommen?.(vorschlag, id)}
      onUebernahmeRueckgaengig={() => {}}
    />
  );
}

describe("VorschlaegePanel", () => {
  beforeEach(() => {
    mockUebernehmen.mockReset();
    mockVerwerfen.mockReset();
    vi.useRealTimers();
  });

  it("ist über die Tastatur erreichbar mit sinnvollen aria-labels", () => {
    render(<TestHarness initial={[VORSCHLAG_A]} />);
    const karte = screen.getByRole("group", { name: /Vorschlag für Rechtsform/ });
    expect(karte.tabIndex).toBe(0);
    expect(screen.getByRole("button", { name: "Vorschlag übernehmen: Rechtsform" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Vorschlag ablehnen: Rechtsform" })).toBeTruthy();
  });

  it("'Übernehmen' ruft uebernehmeVorschlagAction auf (schreibt als 'abgeleitet') und entfernt die Karte", async () => {
    mockUebernehmen.mockResolvedValueOnce({ status: "erfolg" });
    const onUebernommen = vi.fn();
    render(<TestHarness initial={[VORSCHLAG_A]} onUebernommen={onUebernommen} />);

    fireEvent.click(screen.getByRole("button", { name: "Vorschlag übernehmen: Rechtsform" }));

    await waitFor(() => expect(mockUebernehmen).toHaveBeenCalledWith(VORSCHLAG_A, "kunde-1"));
    await waitFor(() => expect(screen.queryByText("GmbH")).toBeNull());
    expect(onUebernommen).toHaveBeenCalledWith(VORSCHLAG_A, undefined);
  });

  it("'Übernehmen' einer Listen-Zeile gibt die eingefügte id an onUebernommen weiter", async () => {
    mockUebernehmen.mockResolvedValueOnce({ status: "erfolg", id: "zeile-123" });
    const onUebernommen = vi.fn();
    render(<TestHarness initial={[VORSCHLAG_B]} onUebernommen={onUebernommen} />);

    fireEvent.click(screen.getByRole("button", { name: "Vorschlag übernehmen: Kernbotschaft" }));

    await waitFor(() => expect(onUebernommen).toHaveBeenCalledWith(VORSCHLAG_B, "zeile-123"));
  });

  it("'Ablehnen' entfernt die Karte, ohne sie zu persistieren (server-seitiger no-op)", async () => {
    mockVerwerfen.mockResolvedValueOnce({ status: "erfolg" });
    render(<TestHarness initial={[VORSCHLAG_A]} />);

    fireEvent.click(screen.getByRole("button", { name: "Vorschlag ablehnen: Rechtsform" }));

    await waitFor(() => expect(screen.queryByText("GmbH")).toBeNull());
    expect(mockVerwerfen).toHaveBeenCalledWith(VORSCHLAG_A.id);
  });

  it("Undo einer Ablehnung innerhalb von 15 Sekunden stellt die Karte wieder her", async () => {
    mockVerwerfen.mockResolvedValueOnce({ status: "erfolg" });
    render(<TestHarness initial={[VORSCHLAG_A]} />);

    fireEvent.click(screen.getByRole("button", { name: "Vorschlag ablehnen: Rechtsform" }));
    await waitFor(() => expect(screen.getByText(/abgelehnt/)).toBeTruthy());

    fireEvent.click(screen.getByText("Rückgängig"));
    await waitFor(() => expect(screen.getByText("GmbH")).toBeTruthy());
  });

  it("die Undo-Aktion verschwindet nach 15 Sekunden", async () => {
    vi.useFakeTimers();
    mockVerwerfen.mockResolvedValueOnce({ status: "erfolg" });
    render(<TestHarness initial={[VORSCHLAG_A]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Vorschlag ablehnen: Rechtsform" }));
    });
    expect(screen.getByText("Rückgängig")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(15_001);
    });

    expect(screen.queryByText("Rückgängig")).toBeNull();
    vi.useRealTimers();
  });

  it("'Alle übernehmen' zeigt einen Bestätigungs-Dialog vor der Sammel-Aktion", async () => {
    mockUebernehmen.mockResolvedValue({ status: "erfolg" });
    render(<TestHarness initial={[VORSCHLAG_A, VORSCHLAG_B]} />);

    fireEvent.click(screen.getByText("Alle übernehmen"));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/2 Vorschläge werden auf einmal übernommen/)).toBeTruthy();

    fireEvent.click(screen.getByText("Bestätigen"));
    await waitFor(() => expect(mockUebernehmen).toHaveBeenCalledTimes(2));
  });
});
