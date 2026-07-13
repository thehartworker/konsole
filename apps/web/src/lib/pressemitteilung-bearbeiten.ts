// Testbarer Kern von pressemitteilungBearbeitenAction (Issue #45), getrennt
// von actions.ts nach demselben Muster wie freigabe-payloads.ts: actions.ts
// bleibt reine Verkabelung (laden, Berechtigung/Existenz prüfen über RLS,
// weiterreichen), diese Datei ist ohne Supabase-/Netzwerk-Mocking direkt
// gegen FakeHandlerAufrufRepository testbar (siehe
// tests/lib/pressemitteilung-bearbeiten.test.ts).

import type { W1Output } from "@konsole/handlers";
import { ErgebnisBearbeitetValidierungsFehler, type HandlerAufrufRepository } from "@konsole/persistence";
import { pressemitteilungPatchAnwenden, type PressemitteilungPatch } from "./pressemitteilung-patch";

export type PressemitteilungBearbeitenResultat =
  | { status: "erfolg"; freigabeErloschen: boolean }
  | { status: "fehler"; meldung: string };

/**
 * Führt den Patch in `basis` zusammen und schreibt das Ergebnis über das
 * Repository (das serverseitig gegen W1OutputSchema validiert, siehe
 * packages/persistence/src/handler-aufruf.ts). Ein Zod-Fehler dort wird zu
 * einer klaren, für den Client verständlichen Fehlermeldung -- der Client
 * (pressemitteilung-editor.tsx) nutzt "fehler" zum Zurückrollen des
 * optimistisch gesetzten Werts.
 */
export async function pressemitteilungBearbeiten(
  repo: HandlerAufrufRepository,
  handlerAufrufId: string,
  basis: W1Output,
  patch: PressemitteilungPatch,
): Promise<PressemitteilungBearbeitenResultat> {
  const zusammengefuehrt = pressemitteilungPatchAnwenden(basis, patch);

  try {
    const resultat = await repo.ergebnisBearbeitenSpeichern(handlerAufrufId, zusammengefuehrt);
    return { status: "erfolg", freigabeErloschen: resultat.freigabeErloschen };
  } catch (fehler) {
    if (fehler instanceof ErgebnisBearbeitetValidierungsFehler) {
      return { status: "fehler", meldung: `Änderung ungültig: ${fehler.message}` };
    }
    return { status: "fehler", meldung: "Speichern fehlgeschlagen. Bitte erneut versuchen." };
  }
}
