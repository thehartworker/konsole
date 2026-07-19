import { describe, expect, it } from 'vitest';
import { baueKonsolenAdresse, parsePlusAdresse } from '../src/plus-adresse.js';

describe('parsePlusAdresse', () => {
  it('parst eine gültige Plus-Adresse in Agentur-/Kunden-Slug und Domain', () => {
    expect(parsePlusAdresse('mensch-betrieb+neurabin-pharma@intake.example.de')).toEqual({
      agenturSlug: 'mensch-betrieb',
      kundeSlug: 'neurabin-pharma',
      domain: 'intake.example.de',
    });
  });

  it('gibt null zurück, wenn kein "+" im Local-Part vorkommt', () => {
    expect(parsePlusAdresse('presse@kunde-domain.de')).toBeNull();
  });

  it('gibt null zurück bei mehreren "@"', () => {
    expect(parsePlusAdresse('a+b@c@d')).toBeNull();
  });

  it('ignoriert umgebende Whitespaces', () => {
    expect(parsePlusAdresse('  mensch-betrieb+neurabin-pharma@intake.example.de  ')).toEqual({
      agenturSlug: 'mensch-betrieb',
      kundeSlug: 'neurabin-pharma',
      domain: 'intake.example.de',
    });
  });
});

describe('baueKonsolenAdresse', () => {
  it('baut die erwartete Plus-Adresse aus den drei Teilen', () => {
    expect(baueKonsolenAdresse('mensch-betrieb', 'neurabin-pharma', 'intake.example.de')).toBe(
      'mensch-betrieb+neurabin-pharma@intake.example.de',
    );
  });
});
