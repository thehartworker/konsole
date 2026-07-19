import { describe, expect, it } from 'vitest';
import { normalisiereZuKlassifikatorNachricht } from '../src/normalisiere.js';
import { baueAnbindung, baueImapNachricht } from './fixtures.js';

describe('normalisiereZuKlassifikatorNachricht', () => {
  it('nutzt textBody, wenn vorhanden (Multipart-Mail)', () => {
    const nachricht = baueImapNachricht({
      textBody: 'Reiner Text-Teil.',
      htmlBody: '<p>HTML-Teil, sollte ignoriert werden.</p>',
    });

    const ergebnis = normalisiereZuKlassifikatorNachricht(nachricht, baueAnbindung());

    expect(ergebnis.inhalt_text).toBe('Reiner Text-Teil.');
  });

  it('konvertiert HTML zu Text, wenn nur ein HTML-Teil vorliegt (nur-HTML-Mail)', () => {
    const nachricht = baueImapNachricht({
      textBody: null,
      htmlBody: '<p>Erster Absatz.</p><p>Zweiter Absatz.</p>',
    });

    const ergebnis = normalisiereZuKlassifikatorNachricht(nachricht, baueAnbindung());

    expect(ergebnis.inhalt_text).toContain('Erster Absatz.');
    expect(ergebnis.inhalt_text).toContain('Zweiter Absatz.');
    expect(ergebnis.inhalt_text).not.toContain('<p>');
  });

  it('liefert einen leeren String, wenn weder Text- noch HTML-Body vorhanden sind', () => {
    const nachricht = baueImapNachricht({ textBody: null, htmlBody: null });

    const ergebnis = normalisiereZuKlassifikatorNachricht(nachricht, baueAnbindung());

    expect(ergebnis.inhalt_text).toBe('');
  });

  it('bewahrt Umlaute im Betreff und Inhalt (RFC-2047-Dekodierung passiert bereits vor diesem Schritt, in mailparser)', () => {
    const nachricht = baueImapNachricht({
      betreff: 'Rückfrage zu Ihrer Pressemitteilung über Grönland',
      textBody: 'Sehr geehrte Damen und Herren, für Rückfragen stehe ich zur Verfügung.',
    });

    const ergebnis = normalisiereZuKlassifikatorNachricht(nachricht, baueAnbindung());

    expect(ergebnis.betreff).toBe('Rückfrage zu Ihrer Pressemitteilung über Grönland');
    expect(ergebnis.inhalt_text).toContain('Verfügung');
  });

  it('setzt kanal auf email und absender.identifikator auf die Von-Adresse', () => {
    const nachricht = baueImapNachricht({ von: 'presse@kunde-a1.example' });

    const ergebnis = normalisiereZuKlassifikatorNachricht(nachricht, baueAnbindung());

    expect(ergebnis.kanal).toBe('email');
    expect(ergebnis.absender).toEqual({ identifikator: 'presse@kunde-a1.example', aufgeloester_name: null, aufgeloeste_rolle: null });
  });

  it('trägt message_id, an, cc/bcc und die Anbindungs-Referenz in metadaten_kanalspezifisch ein', () => {
    const anbindung = baueAnbindung({ id: 'anbindung-42' });
    const nachricht = baueImapNachricht({
      messageId: '<xyz@absender.example>',
      an: [anbindung.konsolenAdresse!],
      cc: ['cc@sonstwo.example'],
      bcc: ['bcc@sonstwo.example'],
    });

    const ergebnis = normalisiereZuKlassifikatorNachricht(nachricht, anbindung);

    expect(ergebnis.metadaten_kanalspezifisch).toEqual({
      message_id: '<xyz@absender.example>',
      an: [anbindung.konsolenAdresse],
      headers_ausgewaehlt: { cc: ['cc@sonstwo.example'], bcc: ['bcc@sonstwo.example'] },
      anbindung_id: 'anbindung-42',
      anbindungs_typ: 'weiterleitung',
    });
  });
});
