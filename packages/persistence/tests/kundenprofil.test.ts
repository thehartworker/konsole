import { describe, expect, it } from 'vitest';
import { sammleKontext, sammleW1Kontext, type W1Input, type W2Input } from '@konsole/handlers';
import { FakeKundenProfilRepository } from '../src/testing/fake-kundenprofil-repository.js';

describe('FakeKundenProfilRepository', () => {
  it('profilLaden lädt ein vollständiges Profil (Kern + alle Listen) korrekt', async () => {
    const repo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a' },
      kern: { 'kunde-a': { positionierung: 'Marktführer im Nischensegment', grundton: 'sachlich' } },
      boilerplate: [
        { id: 'b1', kunde_id: 'kunde-a', typ: 'kurz', sprache: 'de', text: 'Kurz-Boilerplate', status: 'freigegeben', stand: null },
      ],
      kennzahlen: [
        {
          id: 'k1',
          kunde_id: 'kunde-a',
          bezeichnung: 'Mitarbeitende',
          wert: '42',
          stichtag: '2026-01-01',
          quelle: 'HR-System',
          status: 'freigegeben',
        },
      ],
      themen: [
        {
          id: 't1',
          kunde_id: 'kunde-a',
          thema: 'Lieferengpässe',
          sprachregelung: 'Wir kommunizieren transparent über Lieferzeiten.',
          reaktives_statement: null,
          positionierung_vorhanden: true,
          status: 'freigegeben',
        },
      ],
      praezedenzfaelle: [
        {
          id: 'p1',
          kunde_id: 'kunde-a',
          handler_slug: 'W2_presseanfragen_drafter',
          titel: 'Rückruf 2025',
          volltext: 'Vollständiger Referenz-Text.',
          freigegeben_am: '2025-11-01',
          status: 'freigegeben',
        },
      ],
    });

    const profil = await repo.profilLaden('kunde-a');

    expect(profil.kern?.positionierung).toBe('Marktführer im Nischensegment');
    expect(profil.boilerplate).toHaveLength(1);
    expect(profil.kennzahlen).toHaveLength(1);
    expect(profil.themen).toHaveLength(1);
    expect(profil.praezedenzfaelle).toHaveLength(1);
    expect(profil.sprecher).toHaveLength(0);
    expect(profil.kernbotschaften).toHaveLength(0);
    expect(profil.grenzen).toHaveLength(0);
    expect(profil.freigabekette).toHaveLength(0);
    expect(profil.medienKontext).toHaveLength(0);
  });

  it('Mandanten-Trennung beim Laden: Kunde A sieht nicht die Listen-Zeilen von Kunde B', async () => {
    const repo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a', 'kunde-b': 'kunde-b' },
      boilerplate: [
        { id: 'b1', kunde_id: 'kunde-a', typ: 'kurz', sprache: 'de', text: 'A', status: 'freigegeben', stand: null },
        { id: 'b2', kunde_id: 'kunde-b', typ: 'kurz', sprache: 'de', text: 'B', status: 'freigegeben', stand: null },
      ],
    });

    const profilA = await repo.profilLaden('kunde-a');
    const profilB = await repo.profilLaden('kunde-b');

    expect(profilA.boilerplate).toEqual([{ id: 'b1', kunde_id: 'kunde-a', typ: 'kurz', sprache: 'de', text: 'A', status: 'freigegeben', stand: null }]);
    expect(profilB.boilerplate).toEqual([{ id: 'b2', kunde_id: 'kunde-b', typ: 'kurz', sprache: 'de', text: 'B', status: 'freigegeben', stand: null }]);
  });

  it('ein teilbefülltes Profil (nur Pflicht-Minimum, kein Kern-Datensatz) liefert null/leere Listen statt eines Fehlers', async () => {
    const repo = new FakeKundenProfilRepository({ kundenSlugs: { 'kunde-a': 'kunde-a' } });

    const profil = await repo.profilLaden('kunde-a');

    expect(profil.kern).toBeNull();
    expect(profil.boilerplate).toEqual([]);
    expect(profil.praezedenzfaelle).toEqual([]);
  });

  it('feldStatusSetzen wechselt den Status eines einzelnen Kern-Feldes, ohne andere Felder zu berühren', async () => {
    const repo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a' },
      kern: {
        'kunde-a': {
          positionierung: 'Erschlossene Positionierung',
          grundton: 'sachlich',
          feld_status: { positionierung: { status: 'abgeleitet' }, grundton: { status: 'freigegeben' } },
        },
      },
    });

    await repo.feldStatusSetzen('kunde-a', 'positionierung', 'freigegeben');
    const profil = await repo.profilLaden('kunde-a');

    expect(profil.kern?.feld_status.positionierung?.status).toBe('freigegeben');
    expect(profil.kern?.feld_status.grundton?.status).toBe('freigegeben'); // unberührt
  });

  it('elementStatusSetzen wechselt den Status einer Listen-Zeile von abgeleitet auf freigegeben', async () => {
    const repo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a' },
      praezedenzfaelle: [
        {
          id: 'p1',
          kunde_id: 'kunde-a',
          handler_slug: 'W2_presseanfragen_drafter',
          titel: 'Fall 1',
          volltext: 'Text',
          freigegeben_am: null,
          status: 'abgeleitet',
        },
      ],
    });

    await repo.elementStatusSetzen('kunden_praezedenzfaelle', 'p1', 'freigegeben');
    const profil = await repo.profilLaden('kunde-a');

    expect(profil.praezedenzfaelle[0].status).toBe('freigegeben');
  });

  it('w2KontextLaden liefert thema_positionierung NICHT, solange der Status nur "abgeleitet" ist', async () => {
    const repo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a' },
      kern: {
        'kunde-a': { positionierung: 'KI-Vorschlag, ungeprüft', feld_status: { positionierung: { status: 'abgeleitet' } } },
      },
    });

    const kontext = await repo.w2KontextLaden('kunde-a');

    expect(kontext.thema_positionierung).toBeNull();
  });

  it('w2KontextLaden liefert thema_positionierung, sobald der Status freigegeben ist', async () => {
    const repo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a' },
      kern: {
        'kunde-a': { positionierung: 'Bestätigte Positionierung', feld_status: { positionierung: { status: 'freigegeben' } } },
      },
    });

    const kontext = await repo.w2KontextLaden('kunde-a');

    expect(kontext.thema_positionierung).toBe('Bestätigte Positionierung');
  });

  it('w2KontextLaden wirft, wenn der Kunde nicht existiert', async () => {
    const repo = new FakeKundenProfilRepository({ kundenSlugs: {} });
    await expect(repo.w2KontextLaden('kunde-unbekannt')).rejects.toThrow('existiert nicht');
  });

  it('deterministischeGrenzenAlsPruefregeln übersetzt nur deterministisch erzwungene Grenzen der Typen verbotene_aussage/pflichtbaustein', async () => {
    const repo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a' },
      grenzen: [
        {
          id: 'g1',
          kunde_id: 'kunde-a',
          typ: 'verbotene_aussage',
          inhalt: 'Wir garantieren Heilung',
          textart_geltungsbereich: null,
          ist_deterministisch_erzwungen: true,
          status: 'abgeleitet',
        },
        {
          id: 'g2',
          kunde_id: 'kunde-a',
          typ: 'no_go_thema',
          inhalt: 'Konkurrenzprodukt X',
          textart_geltungsbereich: null,
          ist_deterministisch_erzwungen: true, // typ passt nicht in die Enforcement-Liste
          status: 'freigegeben',
        },
        {
          id: 'g3',
          kunde_id: 'kunde-a',
          typ: 'pflichtbaustein',
          inhalt: 'Rückfragen bitte an presse@kunde-a.example',
          textart_geltungsbereich: null,
          ist_deterministisch_erzwungen: false, // nicht deterministisch erzwungen
          status: 'freigegeben',
        },
      ],
    });

    const regeln = await repo.deterministischeGrenzenAlsPruefregeln('kunde-a', 'W2_presseanfragen_drafter');

    expect(regeln).toHaveLength(1);
    expect(regeln[0]).toMatchObject({
      typ: 'code_baustein',
      baustein_name: 'kundengrenze_verbotene_aussage',
      parameter: { phrase: 'Wir garantieren Heilung' },
      aktiv: true,
    });
  });

  it('w2KontextQuellenProviderErstellen: leere Themen/Präzedenzfälle führen zu Handler-Fallback-Hinweisen statt zu einem Fehler', async () => {
    const repo = new FakeKundenProfilRepository({ kundenSlugs: { 'kunde-a': 'kunde-a' } });
    const kontextProvider = repo.w2KontextQuellenProviderErstellen('kunde-a');
    const kundeKontext = await repo.w2KontextLaden('kunde-a');

    const input: W2Input = {
      anfrage: {
        medium_name: 'Test-Medium',
        journalist_name: null,
        journalist_kontakt: null,
        ressort: null,
        thema_beschreibung: 'Testthema',
        frist_at: null,
        fragen_woertlich: [],
        format_gewuenscht: 'statement',
        sprecher_vorgeschlagen: null,
        sprecher_rolle: null,
      },
      kunde_kontext: kundeKontext,
    };

    const gesammelt = await sammleKontext(input, kontextProvider);

    expect(gesammelt.sprachregelungen.verfuegbar).toBe(false);
    expect(gesammelt.praezedenzen.verfuegbar).toBe(false);
    expect(gesammelt.hinweise.length).toBeGreaterThan(0);
  });

  it('w1KontextLaden liefert die Tonalität EAGER aus kunden_profil, ohne Statusfilterung', async () => {
    const repo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a' },
      kern: {
        'kunde-a': {
          grundton: 'warm-handwerklich',
          anrede_konvention: 'du',
          gendering_konvention: 'gender-stern',
          stil_parameter: { satzlaenge: 'kurz' },
        },
      },
    });

    const kontext = await repo.w1KontextLaden('kunde-a');

    expect(kontext.kunde_slug).toBe('kunde-a');
    expect(kontext.tonalitaet).toEqual({
      grundton: 'warm-handwerklich',
      anrede_konvention: 'du',
      gendering_konvention: 'gender-stern',
      stil_parameter: { satzlaenge: 'kurz' },
    });
  });

  it('w1KontextLaden liefert eine leere Tonalität (alle Felder null/leer), wenn kein Kern-Datensatz existiert', async () => {
    const repo = new FakeKundenProfilRepository({ kundenSlugs: { 'kunde-a': 'kunde-a' } });

    const kontext = await repo.w1KontextLaden('kunde-a');

    expect(kontext.tonalitaet).toEqual({
      grundton: null,
      anrede_konvention: null,
      gendering_konvention: null,
      stil_parameter: {},
    });
  });

  it('w1KontextLaden wirft, wenn der Kunde nicht existiert', async () => {
    const repo = new FakeKundenProfilRepository({ kundenSlugs: {} });
    await expect(repo.w1KontextLaden('kunde-unbekannt')).rejects.toThrow('existiert nicht');
  });

  it('deterministischeGrenzenAlsPruefregeln funktioniert unverändert für W1_pressemitteilung_drafter (handler-agnostisch)', async () => {
    const repo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a' },
      grenzen: [
        {
          id: 'g1',
          kunde_id: 'kunde-a',
          typ: 'pflichtbaustein',
          inhalt: 'Pflichttext gemäß Heilmittelwerbegesetz',
          textart_geltungsbereich: null,
          ist_deterministisch_erzwungen: true,
          status: 'abgeleitet',
        },
      ],
    });

    const regeln = await repo.deterministischeGrenzenAlsPruefregeln('kunde-a', 'W1_pressemitteilung_drafter');

    expect(regeln).toHaveLength(1);
    expect(regeln[0]).toMatchObject({
      handler_slug: 'W1_pressemitteilung_drafter',
      baustein_name: 'kundengrenze_pflichtbaustein',
      parameter: { text: 'Pflichttext gemäß Heilmittelwerbegesetz' },
    });
  });

  it('w1KontextQuellenProviderErstellen: Präzedenzen nur bei status=freigegeben, Boilerplate bereits ab status!=abgeleitet', async () => {
    const repo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a' },
      praezedenzfaelle: [
        { id: 'p1', kunde_id: 'kunde-a', handler_slug: 'W1_pressemitteilung_drafter', titel: 'Freigegeben', volltext: 'Text A', freigegeben_am: '2026-01-01', status: 'freigegeben' },
        { id: 'p2', kunde_id: 'kunde-a', handler_slug: 'W1_pressemitteilung_drafter', titel: 'Abgeleitet', volltext: 'Text B', freigegeben_am: null, status: 'abgeleitet' },
      ],
      boilerplate: [
        { id: 'b1', kunde_id: 'kunde-a', typ: 'lang', sprache: 'de', text: 'Vorläufige Boilerplate', status: 'vorlaeufig', stand: null },
      ],
    });

    const provider = repo.w1KontextQuellenProviderErstellen('kunde-a');

    const praezedenzen = await provider.praezedenzenLaden('kunde-a', 'Anlass');
    expect(praezedenzen).toEqual([{ titel: 'Freigegeben', volltext: 'Text A' }]);

    const boilerplate = await provider.boilerplateLaden('kunde-a', 'lang', 'de');
    expect(boilerplate).toBe('Vorläufige Boilerplate');
  });

  it('w1KontextQuellenProviderErstellen: sprecherLaden liefert zitat_freigabe unverändert (Freigabe-Gate liegt im Handler)', async () => {
    const repo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a' },
      sprecher: [
        { id: 's1', kunde_id: 'kunde-a', name: 'Dr. Mara Beispiel', rolle: 'Geschäftsführung', exakte_schreibweise: 'Dr. Mara Beispiel', zitat_freigabe: false, status: 'freigegeben' },
      ],
    });

    const provider = repo.w1KontextQuellenProviderErstellen('kunde-a');
    const sprecher = await provider.sprecherLaden('kunde-a', 'Dr. Mara Beispiel');

    expect(sprecher).toEqual({
      name: 'Dr. Mara Beispiel',
      rolle: 'Geschäftsführung',
      exakte_schreibweise: 'Dr. Mara Beispiel',
      zitat_freigabe: false,
    });
  });

  it('w1KontextQuellenProviderErstellen: leeres Profil führt zu Handler-Fallback-Hinweisen statt zu einem Fehler', async () => {
    const repo = new FakeKundenProfilRepository({ kundenSlugs: { 'kunde-a': 'kunde-a' } });
    const kontextProvider = repo.w1KontextQuellenProviderErstellen('kunde-a');
    const kundeKontext = await repo.w1KontextLaden('kunde-a');

    const input: W1Input = {
      briefing: {
        anlass: 'Testanlass',
        kernbotschaft: null,
        fakten: [],
        zitat_sprecher: null,
        zitat_kernaussage: null,
        ziel_medien_gruppe: null,
        boilerplate_referenz: null,
        laenge_ziel: 'standard',
        sperrfrist_at: null,
        zusatz_hinweis: null,
      },
      kunde_kontext: kundeKontext,
    };

    const gesammelt = await sammleW1Kontext(input, kontextProvider);

    expect(gesammelt.praezedenzen.verfuegbar).toBe(false);
    expect(gesammelt.boilerplate.verfuegbar).toBe(false);
    expect(gesammelt.hinweise.length).toBeGreaterThan(0);
  });
});
