import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Issue #52, Aufgabe D: Vitest-Tests für das Modus-B-Formular
// (Verbindungstest + Anlage, Fehlerbehandlung).

vi.mock("@/app/kunden/[id]/mail-anbindung/actions", () => ({
  richteImapKundenpostfachEinAction: vi.fn(),
}));

import { richteImapKundenpostfachEinAction } from "@/app/kunden/[id]/mail-anbindung/actions";
import { ModusBFormular } from "@/app/kunden/[id]/mail-anbindung/components/modus-b-formular";

const mockEinrichten = vi.mocked(richteImapKundenpostfachEinAction);

function fuelleFormularAus() {
  fireEvent.change(screen.getByLabelText("IMAP-Host"), { target: { value: "imap.kunde-a1.example" } });
  fireEvent.change(screen.getByLabelText("Port"), { target: { value: "993" } });
  fireEvent.change(screen.getByLabelText("Benutzername"), { target: { value: "presse@kunde-a1.example" } });
  fireEvent.change(screen.getByLabelText("Passwort (App-Passwort)"), { target: { value: "geheim123" } });
}

describe("ModusBFormular", () => {
  beforeEach(() => {
    mockEinrichten.mockReset();
  });

  it("ruft die Server-Action mit den eingegebenen Werten auf und meldet Erfolg über onFertig", async () => {
    mockEinrichten.mockResolvedValueOnce({ status: "erfolg", anbindungId: "anbindung-1" });
    const onFertig = vi.fn();

    render(<ModusBFormular kundeId="kunde-1" onFertig={onFertig} />);
    fuelleFormularAus();
    fireEvent.click(screen.getByText("Verbindung testen und anlegen"));

    await waitFor(() => expect(onFertig).toHaveBeenCalled());
    expect(mockEinrichten).toHaveBeenCalledWith("kunde-1", {
      host: "imap.kunde-a1.example",
      port: "993",
      benutzername: "presse@kunde-a1.example",
      passwort: "geheim123",
    });
  });

  it("zeigt eine Host-nicht-erreichbar-Meldung bei einem Verbindungsfehler", async () => {
    mockEinrichten.mockResolvedValueOnce({ status: "fehler", meldung: "Host nicht erreichbar (ENOTFOUND)." });

    render(<ModusBFormular kundeId="kunde-1" onFertig={vi.fn()} />);
    fuelleFormularAus();
    fireEvent.click(screen.getByText("Verbindung testen und anlegen"));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Host nicht erreichbar");
  });

  it("zeigt eine Zugangsdaten-Meldung, wenn die Authentifizierung fehlschlägt", async () => {
    mockEinrichten.mockResolvedValueOnce({ status: "fehler", meldung: "Zugangsdaten wurden abgelehnt: Invalid credentials" });

    render(<ModusBFormular kundeId="kunde-1" onFertig={vi.fn()} />);
    fuelleFormularAus();
    fireEvent.click(screen.getByText("Verbindung testen und anlegen"));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Zugangsdaten wurden abgelehnt");
  });

  it("verlangt alle Pflichtfelder (HTML-required), bevor die Action aufgerufen wird", () => {
    render(<ModusBFormular kundeId="kunde-1" onFertig={vi.fn()} />);
    expect(screen.getByLabelText("IMAP-Host")).toBeRequired();
    expect(screen.getByLabelText("Port")).toBeRequired();
    expect(screen.getByLabelText("Benutzername")).toBeRequired();
    expect(screen.getByLabelText("Passwort (App-Passwort)")).toBeRequired();
  });
});
