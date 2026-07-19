import { describe, expect, it } from 'vitest';
import { verarbeiteNachricht } from '../src/verarbeite-nachricht.js';
import { baueAbhaengigkeiten, baueAnbindung, baueImapNachricht } from './fixtures.js';
import { MAIL_KLASSIFIKATIONS_ERGEBNIS } from './klassifikations-fixture.js';

describe('verarbeiteNachricht', () => {
  it('a) markiert eine bereits geloggte Nachricht als Duplikat und lässt sie verschieben, ohne einen Vorgang anzulegen', async () => {
    const anbindung = baueAnbindung();
    const { deps, repo } = baueAbhaengigkeiten({ repoOptionen: { anbindungen: [anbindung] } });
    await repo.mailEingangLogSchreiben({
      messageId: '<schon-verarbeitet@absender.example>',
      kundenMailAnbindungId: anbindung.id,
      vorgangId: 'vorgang-alt',
      verarbeitungsStatus: 'angenommen',
    });

    const nachricht = baueImapNachricht({ messageId: '<schon-verarbeitet@absender.example>' });
    const ergebnis = await verarbeiteNachricht(nachricht, [anbindung], deps);

    expect(ergebnis).toEqual({ status: 'duplikat', sollVerschobenWerden: true });
    expect(repo.vorgaenge).toHaveLength(0);
  });

  it('b) Modus A: eine Nachricht ohne passende Anbindung bleibt kein_kunde_zugeordnet, ohne DB-Log-Eintrag (geteiltes Postfach)', async () => {
    const anbindung = baueAnbindung();
    const { deps, repo } = baueAbhaengigkeiten({ repoOptionen: { anbindungen: [anbindung] } });
    const nachricht = baueImapNachricht({ an: ['unbekannt+niemand@intake.example.de'] });

    const ergebnis = await verarbeiteNachricht(nachricht, [anbindung], deps);

    expect(ergebnis).toEqual({ status: 'kein_kunde_zugeordnet', sollVerschobenWerden: false });
    expect(repo.mailEingangLog).toHaveLength(0);
  });

  it('b) Modus B: eine Nachricht auf einer inzwischen inaktiven Anbindung wird geloggt (kunden_mail_anbindung_id bleibt bekannt)', async () => {
    const anbindung = baueAnbindung({ id: 'anbindung-b', anbindungsTyp: 'imap_kundenpostfach', konsolenAdresse: null, aktiv: false });
    const { deps, repo } = baueAbhaengigkeiten({ repoOptionen: { anbindungen: [anbindung] } });
    const nachricht = baueImapNachricht();

    const ergebnis = await verarbeiteNachricht(nachricht, [anbindung], deps, { modusBAnbindungId: 'anbindung-b' });

    expect(ergebnis).toEqual({ status: 'kein_kunde_zugeordnet', sollVerschobenWerden: false });
    expect(repo.mailEingangLog).toEqual([
      {
        messageId: nachricht.messageId,
        kundenMailAnbindungId: 'anbindung-b',
        vorgangId: null,
        verarbeitungsStatus: 'kein_kunde_zugeordnet',
      },
    ]);
  });

  it('c-d) kompletter Erfolgspfad: legt einen Vorgang an, klassifiziert ihn und loggt "angenommen"', async () => {
    const anbindung = baueAnbindung();
    const { deps, repo, klassifikationsRepo } = baueAbhaengigkeiten({
      repoOptionen: { anbindungen: [anbindung], kundenSlugs: { [anbindung.kundeId]: 'kunde-a1-test' } },
      klassifikationsRepoOptionen: {
        kunden: [{ id: anbindung.kundeId, agentur_id: anbindung.agenturId, autonomie_level: 1 }],
      },
      mockAntworten: [{ text: JSON.stringify(MAIL_KLASSIFIKATIONS_ERGEBNIS), tokenVerbrauch: { input_tokens: 100, output_tokens: 50 } }],
    });

    const nachricht = baueImapNachricht();
    const ergebnis = await verarbeiteNachricht(nachricht, [anbindung], deps);

    expect(ergebnis.status).toBe('angenommen');
    expect(repo.vorgaenge).toHaveLength(1);
    expect(repo.vorgaenge[0]).toMatchObject({ agenturId: anbindung.agenturId, kundeId: anbindung.kundeId, betreff: 'Testbetreff' });
    expect(klassifikationsRepo.llmNutzung).toHaveLength(1);

    const logEintrag = repo.mailEingangLog.at(-1);
    expect(logEintrag).toMatchObject({
      messageId: nachricht.messageId,
      kundenMailAnbindungId: anbindung.id,
      verarbeitungsStatus: 'angenommen',
    });
    expect(logEintrag?.vorgangId).toBe(repo.vorgaenge[0].id);
  });

  it('d) lädt Anhänge in den Storage-Bucket hoch und registriert die Metadaten am Vorgang', async () => {
    const anbindung = baueAnbindung();
    const { deps, repo } = baueAbhaengigkeiten({
      repoOptionen: { anbindungen: [anbindung], kundenSlugs: { [anbindung.kundeId]: 'kunde-a1-test' } },
      klassifikationsRepoOptionen: {
        kunden: [{ id: anbindung.kundeId, agentur_id: anbindung.agenturId, autonomie_level: 1 }],
      },
      mockAntworten: [{ text: JSON.stringify(MAIL_KLASSIFIKATIONS_ERGEBNIS), tokenVerbrauch: { input_tokens: 10, output_tokens: 10 } }],
    });

    const nachricht = baueImapNachricht({
      anhaenge: [{ dateiname: 'pm.pdf', contentType: 'application/pdf', groesseBytes: 10, inhalt: new Uint8Array([1]) }],
    });
    await verarbeiteNachricht(nachricht, [anbindung], deps);

    expect(repo.vorgaenge[0].anhaenge).toHaveLength(1);
    expect(repo.vorgaenge[0].anhaenge[0]).toMatchObject({ dateiname: 'pm.pdf', contentType: 'application/pdf' });
  });

  it('e) markiert einen unerwarteten Fehler als "fehler", ohne die Schleife crashen zu lassen', async () => {
    const anbindung = baueAnbindung();
    // kundenSlugs bewusst leer -> kundeSlugLaden liefert null -> Fehlerpfad.
    const { deps, repo } = baueAbhaengigkeiten({ repoOptionen: { anbindungen: [anbindung] } });

    const nachricht = baueImapNachricht();
    const ergebnis = await verarbeiteNachricht(nachricht, [anbindung], deps);

    expect(ergebnis.status).toBe('fehler');
    expect(ergebnis).toMatchObject({ sollVerschobenWerden: false });
    expect(repo.vorgaenge).toHaveLength(0);
    expect(repo.mailEingangLog).toEqual([
      {
        messageId: nachricht.messageId,
        kundenMailAnbindungId: anbindung.id,
        vorgangId: null,
        verarbeitungsStatus: 'fehler',
        fehlerMeldung: expect.stringContaining(anbindung.kundeId),
      },
    ]);
  });
});
