import { describe, expect, it } from "vitest";
import { FakeKlassifikationsRepository } from "@konsole/persistence/testing";
import { MockLLMProvider } from "@konsole/llm/testing";
import { fuehreProfilExtraktionAus } from "@/lib/profil-extraktion-ausfuehren";

// Issue #50, Tests: "Vitest-Test für die Extraktions-Server-Actions: bei
// Fehler im Extraktions-Backend gibt die Action eine strukturierte
// Fehler-Antwort, die UI erhält eine sinnvolle Fehlermeldung, kein Crash."
// fuehreProfilExtraktionAus ist der testbare Kern hinter den Extraktions-
// Server-Actions (actions.ts ist bewusst nur Verkabelung, siehe dortiger
// Kommentar).

const KUNDE_ID = "kunde-1";

const GUELTIGER_VORSCHLAG = {
  fakten: { rechtsform: "GmbH", sitz: "München", geschaeftsbeschreibung: null },
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

function repoMitKunde() {
  return new FakeKlassifikationsRepository({
    kunden: [{ id: KUNDE_ID, agentur_id: "agentur-1", autonomie_level: 1 }],
  });
}

describe("fuehreProfilExtraktionAus", () => {
  it("gibt bei Kunde nicht gefunden eine strukturierte Fehler-Antwort ohne LLM-Call", async () => {
    const provider = new MockLLMProvider({ antworten: [] });
    const resultat = await fuehreProfilExtraktionAus({
      kundeId: "unbekannt",
      quelle: "dokument-upload",
      text: "Ein Text.",
      bezeichnung: "test.pdf",
      provider,
      repo: repoMitKunde(),
    });

    expect(resultat.status).toBe("fehler");
    expect(provider.aufrufe).toHaveLength(0);
  });

  it("gibt bei ungültiger LLM-Antwort (kein valides JSON) eine strukturierte Fehler-Antwort, kein Crash", async () => {
    const repo = repoMitKunde();
    const provider = new MockLLMProvider({
      antworten: [{ text: "Das ist kein JSON.", tokenVerbrauch: { input_tokens: 100, output_tokens: 20 } }],
    });

    const resultat = await fuehreProfilExtraktionAus({
      kundeId: KUNDE_ID,
      quelle: "dokument-upload",
      text: "Ein Text.",
      bezeichnung: "test.pdf",
      provider,
      repo,
    });

    expect(resultat.status).toBe("fehler");
    if (resultat.status === "fehler") {
      expect(resultat.meldung.length).toBeGreaterThan(0);
    }
    // Der LLM-Call wurde trotzdem protokolliert (Token-Verbrauch bereits
    // angefallen), gleiches Prinzip wie die Backend-Orchestrierung.
    expect(repo.llmNutzung).toHaveLength(1);
    expect(repo.llmNutzung[0].handler_slug).toBe("profil_extraktion");
  });

  it("gibt bei Zod-Validierungsfehler eine strukturierte Fehler-Antwort, kein Crash", async () => {
    const repo = repoMitKunde();
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify({ nur: "falsche Struktur" }), tokenVerbrauch: { input_tokens: 100, output_tokens: 20 } }],
    });

    const resultat = await fuehreProfilExtraktionAus({
      kundeId: KUNDE_ID,
      quelle: "dokument-upload",
      text: "Ein Text.",
      bezeichnung: "test.pdf",
      provider,
      repo,
    });

    expect(resultat.status).toBe("fehler");
  });

  it("gibt den Vorschlag bei erfolgreicher Extraktion durch und protokolliert llm_nutzung", async () => {
    const repo = repoMitKunde();
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(GUELTIGER_VORSCHLAG), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } }],
    });

    const resultat = await fuehreProfilExtraktionAus({
      kundeId: KUNDE_ID,
      quelle: "dokument-upload",
      text: "Ein Text über die Firma.",
      bezeichnung: "test.pdf",
      provider,
      repo,
    });

    expect(resultat.status).toBe("erfolg");
    if (resultat.status === "erfolg") {
      expect(resultat.vorschlag.fakten.rechtsform).toBe("GmbH");
    }
    expect(repo.llmNutzung).toHaveLength(1);
    expect(repo.llmNutzung[0].input_tokens).toBe(500);
    expect(repo.llmNutzung[0].kunde_id).toBe(KUNDE_ID);
  });
});
