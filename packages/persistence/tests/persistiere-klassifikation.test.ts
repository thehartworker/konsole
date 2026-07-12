import { describe, expect, it } from 'vitest';
import { persistiereErfolgreicheKlassifikation } from '../src/persistiere-klassifikation.js';
import { FakeKlassifikationsRepository } from '../src/testing/index.js';
import {
  ERGEBNIS_ZWEI_ANLIEGEN,
  KUNDE_A1_ID,
  KUNDE_A1_STUFE1,
  KUNDE_A1_STUFE2,
  NUTZER_JULIA,
  VORGANG_ID,
} from './fixtures.js';

function baueEingabe() {
  return {
    vorgangId: VORGANG_ID,
    kundeId: KUNDE_A1_ID,
    ergebnis: ERGEBNIS_ZWEI_ANLIEGEN,
  };
}

describe('persistiereErfolgreicheKlassifikation', () => {
  it('(Aufgabe A) schreibt alle anliegen-Zeilen, schließt den Vorgang mit status=done ab und schreibt genau einen audit_log-Eintrag', async () => {
    const repo = new FakeKlassifikationsRepository({
      kunden: [KUNDE_A1_STUFE1],
      nutzer: [NUTZER_JULIA],
    });

    const resultat = await persistiereErfolgreicheKlassifikation(baueEingabe(), repo);

    expect(resultat.status).toBe('done');
    expect(repo.anliegen).toHaveLength(2);
    expect(repo.anliegen.every((a) => a.deleted_at === null)).toBe(true);
    expect(repo.anliegen[0].beschreibung).toBe('Website-Text für die Sauerteig-Linie');

    const vorgang = repo.vorgaenge.get(VORGANG_ID);
    expect(vorgang?.klassifikation_status).toBe('done');
    expect(vorgang?.klassifikation?.typ_primaer).toBe('Anfrage');
    expect(vorgang?.klassifikation?.sensitivity).toBe('normal');

    expect(repo.auditLog).toHaveLength(1);
    expect(repo.auditLog[0].aktion).toBe('klassifikation_abgeschlossen');
    expect(repo.auditLog[0].agentur_id).toBe(KUNDE_A1_STUFE1.agentur_id);
  });

  it('löst routing.person_slug ("julia_schmidt") korrekt zur zustaendige_nutzer_id auf, UND routing.verteiler (ebenfalls Slugs) zu einer uuid[] für routing_verteiler', async () => {
    const repo = new FakeKlassifikationsRepository({
      kunden: [KUNDE_A1_STUFE1],
      nutzer: [NUTZER_JULIA],
    });

    await persistiereErfolgreicheKlassifikation(baueEingabe(), repo);

    const vorgang = repo.vorgaenge.get(VORGANG_ID);
    expect(vorgang?.klassifikation?.zustaendige_nutzer_id).toBe(NUTZER_JULIA.id);
    expect(vorgang?.klassifikation?.routing_verteiler).toEqual([NUTZER_JULIA.id]);
  });

  it('verwirft nicht auflösbare Verteiler-Slugs statt den Vorgang scheitern zu lassen', async () => {
    const repo = new FakeKlassifikationsRepository({
      kunden: [KUNDE_A1_STUFE1],
      nutzer: [], // "julia_schmidt" löst zu keiner nutzer.id auf
    });

    const resultat = await persistiereErfolgreicheKlassifikation(baueEingabe(), repo);

    expect(resultat.status).toBe('done');
    expect(repo.vorgaenge.get(VORGANG_ID)?.klassifikation?.routing_verteiler).toEqual([]);
  });

  it('setzt zustaendige_nutzer_id auf NULL, wenn kein Nutzer zum person_slug passt', async () => {
    const repo = new FakeKlassifikationsRepository({
      kunden: [KUNDE_A1_STUFE1],
      nutzer: [], // keine Nutzer -> kein Treffer möglich
    });

    await persistiereErfolgreicheKlassifikation(baueEingabe(), repo);

    const vorgang = repo.vorgaenge.get(VORGANG_ID);
    expect(vorgang?.klassifikation?.zustaendige_nutzer_id).toBeNull();
  });

  it('(kein halber Vorgang) löscht bereits eingefügte anliegen-Zeilen (soft-delete) und setzt klassifikation_status=failed, wenn ein späterer Schritt fehlschlägt', async () => {
    const repo = new FakeKlassifikationsRepository({
      kunden: [KUNDE_A1_STUFE1],
      nutzer: [NUTZER_JULIA],
    });
    repo.vorgangKlassifikationAbschliessen = async () => {
      throw new Error('Simulierter Netzwerk-Fehler beim vorgaenge-Update');
    };

    const resultat = await persistiereErfolgreicheKlassifikation(baueEingabe(), repo);

    expect(resultat.status).toBe('failed');
    expect(repo.anliegen).toHaveLength(2);
    expect(repo.anliegen.every((a) => a.deleted_at !== null)).toBe(true); // soft-deleted, nicht entfernt
    expect(repo.vorgaenge.get(VORGANG_ID)?.klassifikation_status).toBe('failed');
    expect(repo.auditLog).toHaveLength(0); // kein audit_log-Eintrag für einen gescheiterten Vorgang
  });

  it('(Aufgabe C, Shadow-Mode) protokolliert bei Stufe 1 automatischer_versand_erlaubt=false im audit_log, bei Stufe 2 =true, löst aber in KEINEM Fall einen Handler aus (kein solcher Code-Pfad existiert)', async () => {
    const repoStufe1 = new FakeKlassifikationsRepository({ kunden: [KUNDE_A1_STUFE1], nutzer: [NUTZER_JULIA] });
    await persistiereErfolgreicheKlassifikation(baueEingabe(), repoStufe1);
    expect(repoStufe1.auditLog[0].aktion_payload.automatischer_versand_erlaubt).toBe(false);

    const repoStufe2 = new FakeKlassifikationsRepository({ kunden: [KUNDE_A1_STUFE2], nutzer: [NUTZER_JULIA] });
    await persistiereErfolgreicheKlassifikation(baueEingabe(), repoStufe2);
    expect(repoStufe2.auditLog[0].aktion_payload.automatischer_versand_erlaubt).toBe(true);

    // Strukturkontrolle: backend_handler_vorschlag landet unveraendert als
    // reine Daten in den persistierten anliegen-Zeilen (kein "ausgeloest"-
    // Status, kein handler_aufrufe-Insert). persistiere-klassifikation.ts
    // importiert packages/handlers an keiner Stelle -- ein Handler-Aufruf ist
    // unabhaengig vom Autonomie-Level strukturell unmoeglich, nicht nur durch
    // die Pruefung selbst verhindert.
    for (const anliegen of repoStufe1.anliegen) {
      expect(anliegen).not.toHaveProperty('handler_aufruf_id');
      expect(anliegen).not.toHaveProperty('handler_ausgeloest');
    }
  });

  it('wirft, wenn der referenzierte Kunde nicht existiert (agentur_id kann nicht abgeleitet werden)', async () => {
    const repo = new FakeKlassifikationsRepository({ kunden: [], nutzer: [] });

    await expect(persistiereErfolgreicheKlassifikation(baueEingabe(), repo)).rejects.toThrow(
      /existiert nicht/,
    );
  });
});
