import { describe, expect, it } from 'vitest';
import { ladeEnv, pruefeKonsolenPostfachEnv } from '../src/env.js';

const GUELTIGE_BASIS = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  ANTHROPIC_API_KEY: 'anthropic-key',
  IMAP_PASSWORT_VERSCHLUESSELUNGS_SCHLUESSEL: 'a'.repeat(64),
};

describe('ladeEnv', () => {
  it('lädt eine gültige Minimal-Konfiguration mit Defaults für optionale Vars', () => {
    const env = ladeEnv(GUELTIGE_BASIS as NodeJS.ProcessEnv);
    expect(env.HEALTH_PORT).toBe(3001);
    expect(env.FALLBACK_POLL_INTERVALL_MS).toBe(5 * 60 * 1000);
    expect(env.KONSOLEN_POSTFACH_IMAP_HOST).toBeUndefined();
  });

  it('wirft mit einer verständlichen Meldung, wenn eine Pflicht-Var fehlt', () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _weg, ...ohneServiceRole } = GUELTIGE_BASIS;
    expect(() => ladeEnv(ohneServiceRole as NodeJS.ProcessEnv)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('wirft, wenn der Verschlüsselungs-Schlüssel zu kurz ist', () => {
    expect(() => ladeEnv({ ...GUELTIGE_BASIS, IMAP_PASSWORT_VERSCHLUESSELUNGS_SCHLUESSEL: 'zu-kurz' } as NodeJS.ProcessEnv)).toThrow(
      /IMAP_PASSWORT_VERSCHLUESSELUNGS_SCHLUESSEL/,
    );
  });
});

describe('pruefeKonsolenPostfachEnv', () => {
  it('wirft, wenn Modus-A-Anbindungen aktiv sind, aber die Postfach-Vars fehlen', () => {
    const env = ladeEnv(GUELTIGE_BASIS as NodeJS.ProcessEnv);
    expect(() => pruefeKonsolenPostfachEnv(env)).toThrow(/KONSOLEN_POSTFACH_IMAP_HOST/);
  });

  it('wirft nicht, wenn alle vier Postfach-Vars gesetzt sind', () => {
    const env = ladeEnv({
      ...GUELTIGE_BASIS,
      KONSOLEN_POSTFACH_IMAP_HOST: 'imap.mailbox.org',
      KONSOLEN_POSTFACH_IMAP_PORT: '993',
      KONSOLEN_POSTFACH_IMAP_USER: 'intake@example.de',
      KONSOLEN_POSTFACH_IMAP_PASS: 'geheim',
    } as NodeJS.ProcessEnv);

    expect(() => pruefeKonsolenPostfachEnv(env)).not.toThrow();
  });
});
