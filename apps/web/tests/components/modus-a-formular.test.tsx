import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

// Issue #52, Aufgabe D: Vitest-Tests für das Modus-A-Formular
// (Weiterleitung einrichten, Verbindungstest-UI, Fehlerbehandlung).

vi.mock("@/app/kunden/[id]/mail-anbindung/actions", () => ({
  richteWeiterleitungEinAction: vi.fn(),
  testeKonsolenPostfachEintreffenAction: vi.fn(),
}));

import { richteWeiterleitungEinAction, testeKonsolenPostfachEintreffenAction } from "@/app/kunden/[id]/mail-anbindung/actions";
import { ModusAFormular } from "@/app/kunden/[id]/mail-anbindung/components/modus-a-formular";

const mockErzeugen = vi.mocked(richteWeiterleitungEinAction);
const mockTesten = vi.mocked(testeKonsolenPostfachEintreffenAction);

describe("ModusAFormular", () => {
  beforeEach(() => {
    mockErzeugen.mockReset();
    mockTesten.mockReset();
  });

  it("erzeugt bei Klick eine Konsolen-Adresse und zeigt sie an", async () => {
    mockErzeugen.mockResolvedValueOnce({
      status: "erfolg",
      anbindungId: "anbindung-1",
      konsolenAdresse: "mensch-betrieb+neurabin-pharma@intake.example.de",
    });

    render(<ModusAFormular kundeId="kunde-1" onFertig={vi.fn()} />);
    fireEvent.click(screen.getByText("Adresse erzeugen"));

    await waitFor(() => expect(screen.getByText("mensch-betrieb+neurabin-pharma@intake.example.de")).toBeTruthy());
    expect(mockErzeugen).toHaveBeenCalledWith("kunde-1");
  });

  it("zeigt eine Fehlermeldung, wenn das Erzeugen der Adresse fehlschlägt", async () => {
    mockErzeugen.mockResolvedValueOnce({ status: "fehler", meldung: "Agentur nicht gefunden." });

    render(<ModusAFormular kundeId="kunde-1" onFertig={vi.fn()} />);
    fireEvent.click(screen.getByText("Adresse erzeugen"));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Agentur nicht gefunden.");
  });

  it("startet nach erfolgreicher Adress-Erzeugung den Verbindungstest und ruft onFertig bei Erfolg", async () => {
    mockErzeugen.mockResolvedValueOnce({ status: "erfolg", anbindungId: "a1", konsolenAdresse: "x+y@intake.example.de" });
    mockTesten.mockResolvedValueOnce({ status: "erfolg" });
    const onFertig = vi.fn();

    render(<ModusAFormular kundeId="kunde-1" onFertig={onFertig} />);
    fireEvent.click(screen.getByText("Adresse erzeugen"));
    await waitFor(() => expect(screen.getByText("Verbindung testen")).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByText("Verbindung testen"));
    });

    await waitFor(() => expect(onFertig).toHaveBeenCalled());
    expect(mockTesten).toHaveBeenCalledWith("kunde-1", expect.any(String));
  });

  it("zeigt eine klare Fehlermeldung, wenn die Test-Mail nicht ankommt (60s-Timeout)", async () => {
    mockErzeugen.mockResolvedValueOnce({ status: "erfolg", anbindungId: "a1", konsolenAdresse: "x+y@intake.example.de" });
    mockTesten.mockResolvedValueOnce({
      status: "fehler",
      meldung: "Die Test-Mail ist innerhalb von 60 Sekunden nicht im Konsolen-Postfach eingetroffen.",
    });

    render(<ModusAFormular kundeId="kunde-1" onFertig={vi.fn()} />);
    fireEvent.click(screen.getByText("Adresse erzeugen"));
    await waitFor(() => expect(screen.getByText("Verbindung testen")).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByText("Verbindung testen"));
    });

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("nicht im Konsolen-Postfach eingetroffen");
    // Formular bleibt im "adresse-erzeugt"-Zustand -- der Button ist wieder klickbar für einen erneuten Versuch.
    expect(screen.getByText("Verbindung testen")).toBeTruthy();
  });
});
