import { describe, expect, it } from 'vitest';
import { ordneNachrichtZuKundenAnbindung } from '../src/ordne-nachricht-zu.js';
import { baueAnbindung, baueImapNachricht } from './fixtures.js';

describe('ordneNachrichtZuKundenAnbindung', () => {
  it('Modus A: findet die Anbindung über die Plus-Adresse im To-Feld', () => {
    const anbindung = baueAnbindung();
    const nachricht = baueImapNachricht({ an: [anbindung.konsolenAdresse!] });

    expect(ordneNachrichtZuKundenAnbindung(nachricht, [anbindung])).toBe(anbindung);
  });

  it('Modus A: findet die Anbindung, wenn die Plus-Adresse nur im Cc steht', () => {
    const anbindung = baueAnbindung();
    const nachricht = baueImapNachricht({ an: ['irgendwer@sonstwo.example'], cc: [anbindung.konsolenAdresse!] });

    expect(ordneNachrichtZuKundenAnbindung(nachricht, [anbindung])).toBe(anbindung);
  });

  it('Modus A: findet die Anbindung, wenn die Plus-Adresse nur im Bcc steht', () => {
    const anbindung = baueAnbindung();
    const nachricht = baueImapNachricht({ an: ['irgendwer@sonstwo.example'], bcc: [anbindung.konsolenAdresse!] });

    expect(ordneNachrichtZuKundenAnbindung(nachricht, [anbindung])).toBe(anbindung);
  });

  it('Modus A: mehrere Empfänger im To-Feld, nur einer davon passt', () => {
    const anbindung = baueAnbindung();
    const nachricht = baueImapNachricht({
      an: ['jemand-anderes+andere-firma@intake.example.de', anbindung.konsolenAdresse!, 'noch-wer@sonstwo.example'],
    });

    expect(ordneNachrichtZuKundenAnbindung(nachricht, [anbindung])).toBe(anbindung);
  });

  it('gibt null zurück, wenn keine Anbindung passt', () => {
    const anbindung = baueAnbindung();
    const nachricht = baueImapNachricht({ an: ['unbekannt+niemand@intake.example.de'] });

    expect(ordneNachrichtZuKundenAnbindung(nachricht, [anbindung])).toBeNull();
  });

  it('gibt null zurück, wenn kein Empfänger überhaupt wie eine Plus-Adresse aussieht', () => {
    const anbindung = baueAnbindung();
    const nachricht = baueImapNachricht({ an: ['presse@kunde-domain.de'] });

    expect(ordneNachrichtZuKundenAnbindung(nachricht, [anbindung])).toBeNull();
  });

  it('ignoriert inaktive weiterleitung-Anbindungen', () => {
    const anbindung = baueAnbindung({ aktiv: false });
    const nachricht = baueImapNachricht({ an: [anbindung.konsolenAdresse!] });

    expect(ordneNachrichtZuKundenAnbindung(nachricht, [anbindung])).toBeNull();
  });

  it('Modus B: liefert direkt die per modusBAnbindungId benannte Anbindung, ohne Header zu prüfen', () => {
    const anbindung = baueAnbindung({ id: 'anbindung-b', anbindungsTyp: 'imap_kundenpostfach', konsolenAdresse: null });
    const nachricht = baueImapNachricht({ an: ['irgendeine-adresse@kunde-a1.example'] });

    expect(
      ordneNachrichtZuKundenAnbindung(nachricht, [anbindung], { modusBAnbindungId: 'anbindung-b' }),
    ).toBe(anbindung);
  });

  it('Modus B: gibt null zurück, wenn die benannte Anbindung inaktiv ist', () => {
    const anbindung = baueAnbindung({ id: 'anbindung-b', anbindungsTyp: 'imap_kundenpostfach', aktiv: false });
    const nachricht = baueImapNachricht();

    expect(
      ordneNachrichtZuKundenAnbindung(nachricht, [anbindung], { modusBAnbindungId: 'anbindung-b' }),
    ).toBeNull();
  });
});
