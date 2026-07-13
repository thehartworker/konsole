import { describe, expect, it } from 'vitest';
import type { W1Output } from '@konsole/handlers';
import { FakeHandlerAufrufRepository } from '../src/testing/fake-handler-aufruf-repository.js';
import { ErgebnisBearbeitetValidierungsFehler } from '../src/handler-aufruf.js';

const GUELTIGES_ERGEBNIS: W1Output = {
  pressemitteilung: {
    headline: 'Headline',
    sub_headline: null,
    ort_datum: 'München, 13. Juli 2026',
    lead_absatz: 'Lead.',
    ausfuehrung_absaetze: ['Absatz.'],
    zitat: null,
    boilerplate: 'Boilerplate.',
    kontakt_fusszeile: 'Kontakt.',
    laenge_worte: 5,
  },
  kritiker_findings: [],
  grenz_pruefung_ergebnis: { bestanden: true, verstoesse: [] },
  ueberarbeitungsbeduerftig: false,
  benoetigt_menschliche_freigabe: true,
  freigabe_grund: 'Standard.',
  vorschlaege_fuer_naechste_schritte: [],
  hinweise: [],
  audit_metadaten: { verwendete_quellen: [], modell: 'test', dauer_ms: 0, tokens_input: 0, tokens_output: 0 },
};

describe('FakeHandlerAufrufRepository.ergebnisBearbeitenSpeichern', () => {
  it('schreibt ein gültiges W1Output und meldet freigabeErloschen=false, wenn zuvor nicht freigegeben', async () => {
    const repo = new FakeHandlerAufrufRepository({
      handlerAufrufe: [{ id: 'h1', ergebnis_bearbeitet: null, freigegeben_at: null, bearbeitet_at: null }],
    });

    const resultat = await repo.ergebnisBearbeitenSpeichern('h1', GUELTIGES_ERGEBNIS);

    expect(resultat.freigabeErloschen).toBe(false);
    expect(repo.handlerAufrufe.get('h1')?.ergebnis_bearbeitet).toEqual(GUELTIGES_ERGEBNIS);
  });

  it('meldet freigabeErloschen=true, wenn die Zeile zuvor freigegeben war', async () => {
    const repo = new FakeHandlerAufrufRepository({
      handlerAufrufe: [{ id: 'h1', ergebnis_bearbeitet: null, freigegeben_at: '2026-07-13T10:00:00Z', bearbeitet_at: null }],
    });

    const resultat = await repo.ergebnisBearbeitenSpeichern('h1', GUELTIGES_ERGEBNIS);

    expect(resultat.freigabeErloschen).toBe(true);
    expect(repo.handlerAufrufe.get('h1')?.freigegeben_at).toBeNull();
  });

  it('wirft ErgebnisBearbeitetValidierungsFehler bei einem Objekt, das nicht dem W1OutputSchema entspricht, und schreibt NICHT', async () => {
    const repo = new FakeHandlerAufrufRepository({
      handlerAufrufe: [{ id: 'h1', ergebnis_bearbeitet: null, freigegeben_at: null, bearbeitet_at: null }],
    });
    const ungueltig = { ...GUELTIGES_ERGEBNIS, pressemitteilung: { ...GUELTIGES_ERGEBNIS.pressemitteilung, headline: '' } };

    await expect(repo.ergebnisBearbeitenSpeichern('h1', ungueltig)).rejects.toBeInstanceOf(ErgebnisBearbeitetValidierungsFehler);
    expect(repo.handlerAufrufe.get('h1')?.ergebnis_bearbeitet).toBeNull();
  });

  it('wirft bei fehlendem handler_aufruf', async () => {
    const repo = new FakeHandlerAufrufRepository();
    await expect(repo.ergebnisBearbeitenSpeichern('unbekannt', GUELTIGES_ERGEBNIS)).rejects.toThrow(/nicht gefunden/);
  });
});
