import { describe, expect, it } from "vitest";
import { anfrageAusAnliegen, briefingAusAnliegen } from "@/lib/handler-input";
import type { AnliegenZeile } from "@/lib/vorgaenge";

const BASIS_ANLIEGEN: AnliegenZeile = {
  id: "anliegen-1",
  vorgang_id: "vorgang-1",
  beschreibung: "Presseanfrage der Süddeutschen zum neuen Produkt.",
  prioritaet: "hoch",
  frist_erschlossen: "2026-07-20",
  frist_annahme: null,
  backend_handler_vorschlag: "W2_presseanfragen_drafter",
  backend_handler_input: {},
};

describe("briefingAusAnliegen", () => {
  it("nutzt vorhandene backend_handler_input-Felder 1:1", () => {
    const anliegen: AnliegenZeile = {
      ...BASIS_ANLIEGEN,
      backend_handler_input: { anlass: "Produktlaunch", kernbotschaft: "Nachhaltiger.", laenge_ziel: "kurz" },
    };
    const briefing = briefingAusAnliegen(anliegen);
    expect(briefing.anlass).toBe("Produktlaunch");
    expect(briefing.kernbotschaft).toBe("Nachhaltiger.");
    expect(briefing.laenge_ziel).toBe("kurz");
  });

  it("fällt bei fehlenden Feldern auf anliegen.beschreibung/frist_erschlossen zurück", () => {
    const briefing = briefingAusAnliegen(BASIS_ANLIEGEN);
    expect(briefing.anlass).toBe(BASIS_ANLIEGEN.beschreibung);
    expect(briefing.sperrfrist_at).toBe("2026-07-20");
    expect(briefing.kernbotschaft).toBeNull();
    expect(briefing.fakten).toEqual([]);
  });

  it("fällt bei ungültigem laenge_ziel auf 'standard' zurück statt zu crashen", () => {
    const anliegen: AnliegenZeile = { ...BASIS_ANLIEGEN, backend_handler_input: { laenge_ziel: "episch" } };
    expect(briefingAusAnliegen(anliegen).laenge_ziel).toBe("standard");
  });
});

describe("anfrageAusAnliegen", () => {
  it("nutzt vorhandene backend_handler_input-Felder 1:1", () => {
    const anliegen: AnliegenZeile = {
      ...BASIS_ANLIEGEN,
      backend_handler_input: { medium_name: "Süddeutsche Zeitung", fragen_woertlich: ["Frage 1?", "Frage 2?"] },
    };
    const anfrage = anfrageAusAnliegen(anliegen);
    expect(anfrage.medium_name).toBe("Süddeutsche Zeitung");
    expect(anfrage.fragen_woertlich).toEqual(["Frage 1?", "Frage 2?"]);
  });

  it("fällt bei fehlenden Feldern auf anliegen.beschreibung/frist_erschlossen zurück", () => {
    const anfrage = anfrageAusAnliegen(BASIS_ANLIEGEN);
    expect(anfrage.thema_beschreibung).toBe(BASIS_ANLIEGEN.beschreibung);
    expect(anfrage.frist_at).toBe("2026-07-20");
    expect(anfrage.medium_name).toBe("unbekanntes Medium");
    expect(anfrage.fragen_woertlich).toEqual([]);
  });

  it("fällt bei ungültigem format_gewuenscht auf 'schriftliche_antworten' zurück", () => {
    const anliegen: AnliegenZeile = { ...BASIS_ANLIEGEN, backend_handler_input: { format_gewuenscht: "telepathie" } };
    expect(anfrageAusAnliegen(anliegen).format_gewuenscht).toBe("schriftliche_antworten");
  });
});
