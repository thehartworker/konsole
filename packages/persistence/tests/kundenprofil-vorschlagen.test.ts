// Tests für die KI-Befüllungs-Insert-Methoden von FakeKundenProfilRepository
// (Issue #37, PR 2): Nicht-Überschreiben-Regel (Kern-Felder) und einfache
// Dubletten-Vorfilterung (Listen-Tabellen). Die produktive Supabase-
// Implementierung teilt dieselbe Logik 1:1 (siehe kundenprofil.ts), eine
// echte Postgres-Instanz zu diesem Zweck extra hochzufahren wäre für reine
// Business-Logik-Tests Overkill -- DB-nahe Aspekte (RLS, Spalten-Constraints)
// deckt die pgTAP-Suite ab (supabase/tests/database/16_kundenprofil_herkunft.test.sql).

import { describe, expect, it } from 'vitest';
import { FakeKundenProfilRepository } from '../src/testing/fake-kundenprofil-repository.js';

describe('kernFelderVorschlagen (Nicht-Überschreiben-Regel)', () => {
  it('überschreibt ein Feld mit Status "abgeleitet" mit dem neuen KI-Vorschlag', async () => {
    const repo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a' },
      kern: {
        'kunde-a': { positionierung: 'Alter Vorschlag', feld_status: { positionierung: { status: 'abgeleitet' } } },
      },
    });

    await repo.kernFelderVorschlagen('kunde-a', { positionierung: 'Neuer Vorschlag' }, 'dokument-upload', '2026-07-12');
    const profil = await repo.profilLaden('kunde-a');

    expect(profil.kern?.positionierung).toBe('Neuer Vorschlag');
    expect(profil.kern?.feld_status.positionierung).toEqual({ status: 'abgeleitet', quelle: 'dokument-upload', stand: '2026-07-12' });
  });

  it('überschreibt ein Feld mit Status "vorlaeufig" ebenfalls (nur "freigegeben" ist geschützt)', async () => {
    const repo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a' },
      kern: { 'kunde-a': { usp: 'Vorläufiger USP', feld_status: { usp: { status: 'vorlaeufig' } } } },
    });

    await repo.kernFelderVorschlagen('kunde-a', { usp: 'KI-Vorschlag USP' }, 'website-scraping', '2026-07-12');
    const profil = await repo.profilLaden('kunde-a');

    expect(profil.kern?.usp).toBe('KI-Vorschlag USP');
  });

  it('überspringt ein Feld mit Status "freigegeben" komplett -- kein Update, kein Feld-Status-Wechsel', async () => {
    const repo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a' },
      kern: {
        'kunde-a': { positionierung: 'Bestätigte Positionierung', feld_status: { positionierung: { status: 'freigegeben' } } },
      },
    });

    await repo.kernFelderVorschlagen('kunde-a', { positionierung: 'KI-Vorschlag, sollte ignoriert werden' }, 'dokument-upload', '2026-07-12');
    const profil = await repo.profilLaden('kunde-a');

    expect(profil.kern?.positionierung).toBe('Bestätigte Positionierung');
    expect(profil.kern?.feld_status.positionierung?.status).toBe('freigegeben');
  });

  it('lässt andere Felder unberührt, wenn nur ein Feld freigegeben ist', async () => {
    const repo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a' },
      kern: {
        'kunde-a': {
          positionierung: 'Bestätigt',
          usp: 'Alter USP',
          feld_status: { positionierung: { status: 'freigegeben' }, usp: { status: 'abgeleitet' } },
        },
      },
    });

    await repo.kernFelderVorschlagen(
      'kunde-a',
      { positionierung: 'Sollte ignoriert werden', usp: 'Neuer USP' },
      'dokument-upload',
      '2026-07-12',
    );
    const profil = await repo.profilLaden('kunde-a');

    expect(profil.kern?.positionierung).toBe('Bestätigt');
    expect(profil.kern?.usp).toBe('Neuer USP');
  });

  it('ignoriert Felder mit Wert null (nicht belegbar), leert kein bestehendes Feld', async () => {
    const repo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a' },
      kern: { 'kunde-a': { sitz: 'München', feld_status: { sitz: { status: 'abgeleitet' } } } },
    });

    await repo.kernFelderVorschlagen('kunde-a', { sitz: null, usp: 'Neuer USP' }, 'dokument-upload', '2026-07-12');
    const profil = await repo.profilLaden('kunde-a');

    expect(profil.kern?.sitz).toBe('München');
    expect(profil.kern?.usp).toBe('Neuer USP');
  });

  it('legt eine kunden_profil-Zeile an, wenn noch keine existiert (erste Berührung mit dem Kunden)', async () => {
    const repo = new FakeKundenProfilRepository({ kundenSlugs: { 'kunde-a': 'kunde-a' } });

    await repo.kernFelderVorschlagen('kunde-a', { rechtsform: 'GmbH' }, 'website-scraping', '2026-07-12');
    const profil = await repo.profilLaden('kunde-a');

    expect(profil.kern?.rechtsform).toBe('GmbH');
    expect(profil.kern?.feld_status.rechtsform?.status).toBe('abgeleitet');
  });
});

describe('listenElementeVorschlagen (Dubletten-Vorfilterung)', () => {
  it('fügt eine neue, inhaltlich unterschiedliche Zeile als status=abgeleitet hinzu', async () => {
    const repo = new FakeKundenProfilRepository({ kundenSlugs: { 'kunde-a': 'kunde-a' } });

    const ergebnis = await repo.listenElementeVorschlagen({
      tabelle: 'kunden_kernbotschaften',
      kundeId: 'kunde-a',
      zeilen: [{ text: 'Wir sind Marktführer im Nischensegment', reihenfolge: 0 }],
      vergleichsSchluessel: (z) => String(z.text ?? ''),
      quelle: 'dokument-upload',
    });

    expect(ergebnis).toEqual({ eingefuegt: 1, dublettenUebersprungen: 0 });
    const profil = await repo.profilLaden('kunde-a');
    expect(profil.kernbotschaften).toHaveLength(1);
    expect(profil.kernbotschaften[0]).toMatchObject({ text: 'Wir sind Marktführer im Nischensegment', status: 'abgeleitet' });
  });

  it('überspringt eine Zeile, die einer bestehenden (auch freigegebenen) Zeile inhaltlich sehr ähnlich ist', async () => {
    const repo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a' },
      kernbotschaften: [
        { id: 'k1', kunde_id: 'kunde-a', text: 'Wir sind Marktführer im Nischensegment', reihenfolge: 0, status: 'freigegeben' },
      ],
    });

    const ergebnis = await repo.listenElementeVorschlagen({
      tabelle: 'kunden_kernbotschaften',
      kundeId: 'kunde-a',
      zeilen: [{ text: 'Wir sind Marktführer im Nischensegment.', reihenfolge: 0 }],
      vergleichsSchluessel: (z) => String(z.text ?? ''),
      quelle: 'website-scraping',
    });

    expect(ergebnis).toEqual({ eingefuegt: 0, dublettenUebersprungen: 1 });
    const profil = await repo.profilLaden('kunde-a');
    expect(profil.kernbotschaften).toHaveLength(1); // unverändert, keine zweite Zeile
  });

  it('dedupliziert auch innerhalb desselben Aufrufs (zwei sehr ähnliche Vorschläge im selben Extraktions-Lauf)', async () => {
    const repo = new FakeKundenProfilRepository({ kundenSlugs: { 'kunde-a': 'kunde-a' } });

    const ergebnis = await repo.listenElementeVorschlagen({
      tabelle: 'kunden_boilerplate',
      kundeId: 'kunde-a',
      zeilen: [
        { typ: 'kurz', sprache: 'de', text: 'Kurzportrait des Unternehmens' },
        { typ: 'kurz', sprache: 'de', text: 'Kurzportrait des Unternehmens.' },
      ],
      vergleichsSchluessel: (z) => String(z.text ?? ''),
      quelle: 'dokument-upload',
    });

    expect(ergebnis).toEqual({ eingefuegt: 1, dublettenUebersprungen: 1 });
  });

  it('legt einen KI-Vorschlag NEBEN eine bestehende freigegebene Zeile, wenn er inhaltlich unterschiedlich ist (keine Nicht-Überschreiben-Regel für Listen)', async () => {
    const repo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a' },
      sprecher: [
        { id: 's1', kunde_id: 'kunde-a', name: 'Dr. Anna Beispiel', rolle: 'CEO', exakte_schreibweise: null, zitat_freigabe: true, status: 'freigegeben' },
      ],
    });

    const ergebnis = await repo.listenElementeVorschlagen({
      tabelle: 'kunden_sprecher',
      kundeId: 'kunde-a',
      zeilen: [{ name: 'Max Mustermann', rolle: 'CFO', exakte_schreibweise: null, zitat_freigabe: false }],
      vergleichsSchluessel: (z) => String(z.name ?? ''),
      quelle: 'dokument-upload',
    });

    expect(ergebnis).toEqual({ eingefuegt: 1, dublettenUebersprungen: 0 });
    const profil = await repo.profilLaden('kunde-a');
    expect(profil.sprecher).toHaveLength(2);
    expect(profil.sprecher.find((s) => s.name === 'Dr. Anna Beispiel')?.status).toBe('freigegeben');
    expect(profil.sprecher.find((s) => s.name === 'Max Mustermann')?.status).toBe('abgeleitet');
  });

  it('erzwingt ist_deterministisch_erzwungen=false für einen KI-vorgeschlagenen Grenzen-Eintrag', async () => {
    const repo = new FakeKundenProfilRepository({ kundenSlugs: { 'kunde-a': 'kunde-a' } });

    await repo.listenElementeVorschlagen({
      tabelle: 'kunden_grenzen',
      kundeId: 'kunde-a',
      zeilen: [{ typ: 'no_go_thema', inhalt: 'Konkurrenzprodukt X', textart_geltungsbereich: null, ist_deterministisch_erzwungen: false }],
      vergleichsSchluessel: (z) => String(z.inhalt ?? ''),
      quelle: 'dokument-upload',
    });

    const profil = await repo.profilLaden('kunde-a');
    expect(profil.grenzen[0].ist_deterministisch_erzwungen).toBe(false);
  });

  it('ist ein No-Op bei einer leeren Vorschlagsliste', async () => {
    const repo = new FakeKundenProfilRepository({ kundenSlugs: { 'kunde-a': 'kunde-a' } });

    const ergebnis = await repo.listenElementeVorschlagen({
      tabelle: 'kunden_themen',
      kundeId: 'kunde-a',
      zeilen: [],
      vergleichsSchluessel: (z) => String(z.thema ?? ''),
      quelle: 'dokument-upload',
    });

    expect(ergebnis).toEqual({ eingefuegt: 0, dublettenUebersprungen: 0 });
  });
});
