import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/kunden/[id]/mail-anbindung/actions", () => ({
  aktiviereAnbindungAction: vi.fn(),
  deaktiviereAnbindungAction: vi.fn(),
  loeschAnbindungAction: vi.fn(),
}));

import { deaktiviereAnbindungAction, loeschAnbindungAction } from "@/app/kunden/[id]/mail-anbindung/actions";
import { BestehendeAnbindung } from "@/app/kunden/[id]/mail-anbindung/components/bestehende-anbindung";
import type { MailAnbindung } from "@/lib/mail-anbindung";

const mockDeaktivieren = vi.mocked(deaktiviereAnbindungAction);
const mockLoeschen = vi.mocked(loeschAnbindungAction);

const ANBINDUNG_MODUS_A: MailAnbindung = {
  id: "anbindung-1",
  anbindungsTyp: "weiterleitung",
  konsolenAdresse: "mensch-betrieb+neurabin-pharma@intake.example.de",
  imapHost: null,
  imapBenutzername: null,
  aktiv: true,
  angelegtAt: "2026-07-19T09:00:00.000Z",
  letzterMailEmpfangAt: null,
};

describe("BestehendeAnbindung", () => {
  beforeEach(() => {
    mockDeaktivieren.mockReset();
    mockLoeschen.mockReset();
  });

  it("zeigt die Zieladresse und den Status für eine Modus-A-Anbindung, nie ein Passwort", () => {
    render(<BestehendeAnbindung kundeId="kunde-1" anbindung={ANBINDUNG_MODUS_A} />);
    expect(screen.getByText("mensch-betrieb+neurabin-pharma@intake.example.de")).toBeTruthy();
    expect(screen.getByText("aktiv")).toBeTruthy();
  });

  it("zeigt Host und Benutzername, aber nie ein Passwort-Feld, für eine Modus-B-Anbindung", () => {
    render(
      <BestehendeAnbindung
        kundeId="kunde-1"
        anbindung={{ ...ANBINDUNG_MODUS_A, anbindungsTyp: "imap_kundenpostfach", konsolenAdresse: null, imapHost: "imap.kunde-a1.example", imapBenutzername: "presse@kunde-a1.example" }}
      />,
    );
    expect(screen.getByText("imap.kunde-a1.example")).toBeTruthy();
    expect(screen.queryByLabelText(/passwort/i)).toBeNull();
  });

  it("löscht erst nach Bestätigung, nicht beim ersten Klick", async () => {
    mockLoeschen.mockResolvedValueOnce({ status: "erfolg" });
    render(<BestehendeAnbindung kundeId="kunde-1" anbindung={ANBINDUNG_MODUS_A} />);

    fireEvent.click(screen.getByText("Löschen"));
    expect(mockLoeschen).not.toHaveBeenCalled();
    expect(screen.getByText(/Wirklich löschen/)).toBeTruthy();

    fireEvent.click(screen.getByText("Ja, löschen"));
    await waitFor(() => expect(mockLoeschen).toHaveBeenCalledWith("anbindung-1", "kunde-1"));
  });

  it("zeigt eine Fehlermeldung, wenn das Deaktivieren fehlschlägt", async () => {
    mockDeaktivieren.mockResolvedValueOnce({ status: "fehler", meldung: "Netzwerkfehler." });
    render(<BestehendeAnbindung kundeId="kunde-1" anbindung={ANBINDUNG_MODUS_A} />);

    fireEvent.click(screen.getByText("Deaktivieren"));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Netzwerkfehler.");
  });
});
