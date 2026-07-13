// Ende-zu-Ende-Tests der Kundenprofil-KI-Befüllung (Issue #37, PR 2): mit
// gemockten Providern (Fake-Provider aus @konsole/profil-extraktion/testing)
// und Mock-LLM (MockLLMProvider aus @konsole/llm/testing) -- kein echter
// Datei-/Netzwerk-/API-Zugriff. Token-Erfassung wird hier als reine
// Business-Logik geprüft (welcher handler_slug/kunde_id landet im
// llmNutzungSchreiben-Aufruf) -- der eigentliche SQL-Insert-Pfad ist DB-nah
// und wird von der pgTAP-Suite abgedeckt (supabase/tests/database/11_llm_nutzung_rls.test.sql),
// nicht hier.

import { describe, expect, it } from 'vitest';
import { MockLLMProvider } from '@konsole/llm/testing';
import { FakeDokumentTextProvider, FakeWebsiteTextProvider } from '@konsole/profil-extraktion/testing';
import type { ProfilExtraktionsVorschlag } from '@konsole/profil-extraktion';
import { FakeKlassifikationsRepository } from '../src/testing/fake-repository.js';
import { FakeKundenProfilRepository } from '../src/testing/fake-kundenprofil-repository.js';
import { FakeKundenQuelldokumenteRepository } from '../src/testing/fake-kunden-quelldokumente-repository.js';
import {
  extrahiereUndPersistiereProfil,
  verarbeiteDokumentUndPersistiereProfil,
  verarbeiteWebsiteUndPersistiereProfil,
} from '../src/profil-extraktion-orchestrierung.js';

function leererVorschlag(teil: Partial<ProfilExtraktionsVorschlag> = {}): ProfilExtraktionsVorschlag {
  return {
    fakten: { rechtsform: null, sitz: null, geschaeftsbeschreibung: null },
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
    ...teil,
  };
}

describe('verarbeiteDokumentUndPersistiereProfil', () => {
  it('Ende-zu-Ende: Dokument -> Text -> Extraktion -> Profil-Schreiben -> extraktion_status "verarbeitet", llm_nutzung mit handler_slug "profil_extraktion"', async () => {
    const vorschlag = leererVorschlag({
      strategie: { positionierung: 'Marktführer im Nischensegment', usp: null },
      kernbotschaften: [{ text: 'Wir liefern Qualität seit 1998', reihenfolge: 0 }],
    });

    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(vorschlag), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 }, modell: 'claude-opus-test' }],
    });
    const repo = new FakeKlassifikationsRepository({
      kunden: [{ id: 'kunde-a', agentur_id: 'agentur-a', autonomie_level: 1 }],
    });
    const kundenProfilRepo = new FakeKundenProfilRepository({ kundenSlugs: { 'kunde-a': 'kunde-a' } });
    const quelldokumenteRepo = new FakeKundenQuelldokumenteRepository({
      quelldokumente: [
        {
          id: 'doc-1',
          kunde_id: 'kunde-a',
          bucket_pfad: 'agentur-a/kunde-a/doc-1-bericht.pdf',
          dateiname: 'bericht.pdf',
          mime_typ: 'application/pdf',
          extraktion_status: 'ausstehend',
        },
      ],
      dateiInhalte: { 'agentur-a/kunde-a/doc-1-bericht.pdf': new Uint8Array([1, 2, 3]) },
    });
    const dokumentTextProvider = new FakeDokumentTextProvider({ textNachQuelldokumentId: { 'doc-1': 'Geschäftsbericht-Inhalt.' } });

    const ergebnis = await verarbeiteDokumentUndPersistiereProfil({
      quelldokumentId: 'doc-1',
      kundeId: 'kunde-a',
      provider,
      dokumentTextProvider,
      repo,
      kundenProfilRepo,
      quelldokumenteRepo,
    });

    expect(ergebnis.ergebnisseProText).toHaveLength(1);
    expect(ergebnis.ergebnisseProText[0].status).toBe('erfolg');
    expect(ergebnis.ergebnisseProText[0].eingefuegteListenElemente).toBe(1);

    const profil = await kundenProfilRepo.profilLaden('kunde-a');
    expect(profil.kern?.positionierung).toBe('Marktführer im Nischensegment');
    expect(profil.kernbotschaften).toHaveLength(1);
    expect(profil.kernbotschaften[0].status).toBe('abgeleitet');

    expect((await quelldokumenteRepo.quelldokumentLaden('doc-1'))?.extraktion_status).toBe('verarbeitet');

    expect(repo.llmNutzung).toHaveLength(1);
    expect(repo.llmNutzung[0]).toMatchObject({
      agentur_id: 'agentur-a',
      kunde_id: 'kunde-a',
      vorgang_id: null,
      handler_slug: 'profil_extraktion',
      input_tokens: 500,
      output_tokens: 300,
      modell: 'claude-opus-test',
    });

    expect(dokumentTextProvider.angefragteDateien).toHaveLength(1);
    expect(dokumentTextProvider.angefragteDateien[0].typ).toBe('pdf');
  });

  it('setzt extraktion_status auf "fehlgeschlagen", wenn die Zod-Validierung scheitert, schreibt aber trotzdem eine llm_nutzung-Zeile (Token bereits verbraucht)', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: '{"invalide": "struktur"}', tokenVerbrauch: { input_tokens: 100, output_tokens: 50 }, modell: 'claude-opus-test' }],
    });
    const repo = new FakeKlassifikationsRepository({ kunden: [{ id: 'kunde-a', agentur_id: 'agentur-a', autonomie_level: 1 }] });
    const kundenProfilRepo = new FakeKundenProfilRepository({ kundenSlugs: { 'kunde-a': 'kunde-a' } });
    const quelldokumenteRepo = new FakeKundenQuelldokumenteRepository({
      quelldokumente: [
        { id: 'doc-1', kunde_id: 'kunde-a', bucket_pfad: 'p1', dateiname: 'x.pdf', mime_typ: 'application/pdf', extraktion_status: 'ausstehend' },
      ],
      dateiInhalte: { p1: new Uint8Array([1]) },
    });
    const dokumentTextProvider = new FakeDokumentTextProvider({ textNachQuelldokumentId: { 'doc-1': 'Text' } });

    const ergebnis = await verarbeiteDokumentUndPersistiereProfil({
      quelldokumentId: 'doc-1',
      kundeId: 'kunde-a',
      provider,
      dokumentTextProvider,
      repo,
      kundenProfilRepo,
      quelldokumenteRepo,
    });

    expect(ergebnis.ergebnisseProText[0].status).toBe('fehlgeschlagen');
    expect((await quelldokumenteRepo.quelldokumentLaden('doc-1'))?.extraktion_status).toBe('fehlgeschlagen');
    expect(repo.llmNutzung).toHaveLength(1); // Token-Erfassung auch bei Zod-Fehlschlag
  });

  it('setzt extraktion_status auf "fehlgeschlagen", wenn die Text-Extraktion selbst wirft (z. B. nicht lesbare Datei)', async () => {
    const provider = new MockLLMProvider({ antworten: [{ text: '{}', tokenVerbrauch: { input_tokens: 1, output_tokens: 1 } }] });
    const repo = new FakeKlassifikationsRepository({ kunden: [{ id: 'kunde-a', agentur_id: 'agentur-a', autonomie_level: 1 }] });
    const kundenProfilRepo = new FakeKundenProfilRepository({ kundenSlugs: { 'kunde-a': 'kunde-a' } });
    const quelldokumenteRepo = new FakeKundenQuelldokumenteRepository({
      quelldokumente: [
        { id: 'doc-1', kunde_id: 'kunde-a', bucket_pfad: 'p1', dateiname: 'x.pdf', mime_typ: 'application/pdf', extraktion_status: 'ausstehend' },
      ],
      // kein passender dateiInhalte-Eintrag -> dateiInhaltLaden wirft
    });
    const dokumentTextProvider = new FakeDokumentTextProvider({ textNachQuelldokumentId: {} });

    await expect(
      verarbeiteDokumentUndPersistiereProfil({
        quelldokumentId: 'doc-1',
        kundeId: 'kunde-a',
        provider,
        dokumentTextProvider,
        repo,
        kundenProfilRepo,
        quelldokumenteRepo,
      }),
    ).rejects.toThrow();

    expect((await quelldokumenteRepo.quelldokumentLaden('doc-1'))?.extraktion_status).toBe('fehlgeschlagen');
  });

  it('wirft, wenn das Quelldokument nicht existiert', async () => {
    const provider = new MockLLMProvider({ antworten: [{ text: '{}', tokenVerbrauch: { input_tokens: 1, output_tokens: 1 } }] });
    const repo = new FakeKlassifikationsRepository({ kunden: [{ id: 'kunde-a', agentur_id: 'agentur-a', autonomie_level: 1 }] });

    await expect(
      verarbeiteDokumentUndPersistiereProfil({
        quelldokumentId: 'unbekannt',
        kundeId: 'kunde-a',
        provider,
        dokumentTextProvider: new FakeDokumentTextProvider({ textNachQuelldokumentId: {} }),
        repo,
        kundenProfilRepo: new FakeKundenProfilRepository({ kundenSlugs: { 'kunde-a': 'kunde-a' } }),
        quelldokumenteRepo: new FakeKundenQuelldokumenteRepository(),
      }),
    ).rejects.toThrow('existiert nicht');
  });
});

describe('verarbeiteWebsiteUndPersistiereProfil', () => {
  it('ein Extraktions-Call PRO gescrapter Seite, alle Ergebnisse akkumulieren additiv im Profil mit herkunft=website-scraping', async () => {
    const vorschlagStartseite = leererVorschlag({ kernbotschaften: [{ text: 'Botschaft von der Startseite', reihenfolge: 0 }] });
    const vorschlagImpressum = leererVorschlag({ fakten: { rechtsform: 'GmbH', sitz: 'München', geschaeftsbeschreibung: null } });

    const provider = new MockLLMProvider({
      antworten: [
        { text: JSON.stringify(vorschlagStartseite), tokenVerbrauch: { input_tokens: 200, output_tokens: 100 }, modell: 'claude-opus-test' },
        { text: JSON.stringify(vorschlagImpressum), tokenVerbrauch: { input_tokens: 150, output_tokens: 80 }, modell: 'claude-opus-test' },
      ],
    });
    const repo = new FakeKlassifikationsRepository({ kunden: [{ id: 'kunde-a', agentur_id: 'agentur-a', autonomie_level: 1 }] });
    const kundenProfilRepo = new FakeKundenProfilRepository({ kundenSlugs: { 'kunde-a': 'kunde-a' } });
    const websiteTextProvider = new FakeWebsiteTextProvider({
      seitenNachKundeId: {
        'kunde-a': [
          { bezeichnung: 'kunde-a.de/', text: 'Startseiten-Inhalt' },
          { bezeichnung: 'kunde-a.de/impressum', text: 'Impressum-Inhalt' },
        ],
      },
    });

    const ergebnis = await verarbeiteWebsiteUndPersistiereProfil({
      kundeId: 'kunde-a',
      website: { kundeId: 'kunde-a', erlaubteDomain: 'kunde-a.de' },
      provider,
      websiteTextProvider,
      repo,
      kundenProfilRepo,
    });

    expect(ergebnis.ergebnisseProText).toHaveLength(2);
    expect(ergebnis.ergebnisseProText.every((e) => e.status === 'erfolg')).toBe(true);

    const profil = await kundenProfilRepo.profilLaden('kunde-a');
    expect(profil.kernbotschaften).toHaveLength(1);
    expect(profil.kernbotschaften[0].herkunft).toBe('website-scraping');
    expect(profil.kern?.rechtsform).toBe('GmbH');
    expect(profil.kern?.sitz).toBe('München');

    expect(repo.llmNutzung).toHaveLength(2); // ein llm_nutzung-Eintrag PRO Seite
    expect(repo.llmNutzung.every((e) => e.handler_slug === 'profil_extraktion' && e.kunde_id === 'kunde-a')).toBe(true);
  });

  it('gibt ein leeres Ergebnis zurück, wenn der WebsiteTextProvider keine Seiten liefert (kein LLM-Call, keine Kosten)', async () => {
    const provider = new MockLLMProvider({ antworten: [{ text: '{}', tokenVerbrauch: { input_tokens: 1, output_tokens: 1 } }] });
    const repo = new FakeKlassifikationsRepository({ kunden: [{ id: 'kunde-a', agentur_id: 'agentur-a', autonomie_level: 1 }] });
    const kundenProfilRepo = new FakeKundenProfilRepository({ kundenSlugs: { 'kunde-a': 'kunde-a' } });
    const websiteTextProvider = new FakeWebsiteTextProvider({ seitenNachKundeId: {} });

    const ergebnis = await verarbeiteWebsiteUndPersistiereProfil({
      kundeId: 'kunde-a',
      website: { kundeId: 'kunde-a', erlaubteDomain: 'kunde-a.de' },
      provider,
      websiteTextProvider,
      repo,
      kundenProfilRepo,
    });

    expect(ergebnis.ergebnisseProText).toEqual([]);
    expect(repo.llmNutzung).toEqual([]);
  });
});

describe('extrahiereUndPersistiereProfil', () => {
  it('reicht unklare_hinweise im Ergebnis durch, ohne sie zu persistieren', async () => {
    const vorschlag = leererVorschlag({ unklare_hinweise: ['Erwähnung eines Preises ohne klaren Kontext'] });
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(vorschlag), tokenVerbrauch: { input_tokens: 10, output_tokens: 10 } }],
    });
    const repo = new FakeKlassifikationsRepository({ kunden: [{ id: 'kunde-a', agentur_id: 'agentur-a', autonomie_level: 1 }] });
    const kundenProfilRepo = new FakeKundenProfilRepository({ kundenSlugs: { 'kunde-a': 'kunde-a' } });

    const ergebnis = await extrahiereUndPersistiereProfil({
      kundeId: 'kunde-a',
      quelle: 'dokument-upload',
      texte: [{ bezeichnung: 'test.txt', text: 'Ein Text' }],
      provider,
      repo,
      kundenProfilRepo,
    });

    expect(ergebnis.ergebnisseProText[0].unklareHinweise).toEqual(['Erwähnung eines Preises ohne klaren Kontext']);
  });

  it('wirft, wenn der Kunde nicht existiert', async () => {
    const provider = new MockLLMProvider({ antworten: [{ text: '{}', tokenVerbrauch: { input_tokens: 1, output_tokens: 1 } }] });
    const repo = new FakeKlassifikationsRepository({ kunden: [] });
    const kundenProfilRepo = new FakeKundenProfilRepository();

    await expect(
      extrahiereUndPersistiereProfil({
        kundeId: 'kunde-unbekannt',
        quelle: 'dokument-upload',
        texte: [{ bezeichnung: 'x', text: 'y' }],
        provider,
        repo,
        kundenProfilRepo,
      }),
    ).rejects.toThrow('existiert nicht');
  });
});
