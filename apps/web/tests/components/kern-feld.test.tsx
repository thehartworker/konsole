import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

// Issue #50, Tests: "Vitest-Component-Tests für den Profil-Editor:
// manuelles Editing eines Kopf-Feldes (Optimistic UI, Rollback bei Fehler,
// Retry)." Gleiches Mock-Muster wie
// apps/web/tests/components/pressemitteilung-editor.test.tsx: die
// Server-Action wird gemockt, kein echter Supabase-Client im Test.

vi.mock("@/app/kunden/[id]/profil/actions", () => ({
  speichereKopfFeldAction: vi.fn(),
  gebeFeldFreiAction: vi.fn(),
}));

import { gebeFeldFreiAction, speichereKopfFeldAction } from "@/app/kunden/[id]/profil/actions";
import { KernFeld } from "@/app/kunden/[id]/profil/components/kern-feld";
import type { KernFeldKonfiguration } from "@/lib/kundenprofil-felder";

const mockSpeichern = vi.mocked(speichereKopfFeldAction);
const mockFreigeben = vi.mocked(gebeFeldFreiAction);

const KONFIGURATION: KernFeldKonfiguration = { key: "rechtsform", label: "Rechtsform", sektion: "fakten", typ: "text" };

function renderFeld(initialWert: unknown = "GmbH", initialStatus: Parameters<typeof KernFeld>[0]["initialStatus"] = undefined) {
  return render(
    <KernFeld kundeId="kunde-1" konfiguration={KONFIGURATION} initialWert={initialWert} initialStatus={initialStatus} />,
  );
}

function aktivierenUndBearbeiten(neuerText: string) {
  const segment = screen.getByRole("button", { name: /Rechtsform/ });
  fireEvent.keyDown(segment, { key: "Enter" });
  const input = screen.getByLabelText("Rechtsform");
  fireEvent.change(input, { target: { value: neuerText } });
  return input;
}

describe("KernFeld -- Optimistic UI und Rollback", () => {
  beforeEach(() => {
    mockSpeichern.mockReset();
    mockFreigeben.mockReset();
  });

  it("ist über die Tastatur erreichbar (Enter aktiviert, sinnvolles aria-label)", () => {
    renderFeld();
    const segment = screen.getByRole("button", { name: "Rechtsform. Enter zum Bearbeiten." });
    expect(segment.tabIndex).toBe(0);
  });

  it("zeigt eine Änderung sofort an, bevor die Server-Action antwortet (optimistic)", async () => {
    let resolveAction: (value: Awaited<ReturnType<typeof speichereKopfFeldAction>>) => void = () => {};
    mockSpeichern.mockReturnValue(new Promise((resolve) => (resolveAction = resolve)));

    renderFeld();
    const input = aktivierenUndBearbeiten("AG");
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    });

    expect(screen.getByText("AG")).toBeTruthy();
    expect(screen.queryByText("GmbH")).toBeNull();

    await act(async () => {
      resolveAction({ status: "erfolg" });
    });
  });

  it("rollt bei einer fehlgeschlagenen Server-Action auf den vorherigen Wert zurück und zeigt einen Retry-Hinweis", async () => {
    mockSpeichern.mockResolvedValueOnce({ status: "fehler", meldung: "Speichern fehlgeschlagen." });

    renderFeld();
    const input = aktivierenUndBearbeiten("AG");
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText("GmbH")).toBeTruthy();
    expect(screen.queryByText("AG")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Speichern fehlgeschlagen");
  });

  it("sendet bei 'Erneut versuchen' denselben Wert erneut, ohne dass die Nutzerin neu eintippen muss", async () => {
    mockSpeichern.mockResolvedValueOnce({ status: "fehler", meldung: "Netzwerkfehler." });
    mockSpeichern.mockResolvedValueOnce({ status: "erfolg" });

    renderFeld();
    const input = aktivierenUndBearbeiten("AG");
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });

    await waitFor(() => expect(screen.getByText("Erneut versuchen")).toBeTruthy());
    fireEvent.click(screen.getByText("Erneut versuchen"));

    await waitFor(() => expect(screen.getByText("AG")).toBeTruthy());
    expect(mockSpeichern).toHaveBeenCalledTimes(2);
    expect(mockSpeichern).toHaveBeenNthCalledWith(2, "kunde-1", "rechtsform", "AG");
  });

  it("Escape verwirft die Änderung, ohne die Server-Action aufzurufen", () => {
    renderFeld();
    const input = aktivierenUndBearbeiten("Verworfen");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.getByText("GmbH")).toBeTruthy();
    expect(mockSpeichern).not.toHaveBeenCalled();
  });

  it("zeigt eine Freigeben-Aktion für vorläufige Werte und ruft gebeFeldFreiAction auf", async () => {
    mockFreigeben.mockResolvedValueOnce({ status: "erfolg" });
    renderFeld("GmbH", { status: "vorlaeufig", quelle: null, stand: "2026-07-10" });

    expect(screen.getByText("vorläufig")).toBeTruthy();
    fireEvent.click(screen.getByText("Freigeben"));

    await waitFor(() => expect(mockFreigeben).toHaveBeenCalledWith({ art: "kern", feldname: "rechtsform" }, "kunde-1"));
  });
});
