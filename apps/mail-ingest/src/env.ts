// Env-Var-Validierung (Issue #52, Aufgabe C). Scheitert laut beim Start,
// statt mitten in der Ingest-Schleife an einer fehlenden Variable zu
// stolpern -- AGENTS.md §4 ("Keine Secrets im Code"): alle Werte kommen aus
// process.env, nichts ist hier hartkodiert.

import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  IMAP_PASSWORT_VERSCHLUESSELUNGS_SCHLUESSEL: z.string().min(32, 'Schlüssel sollte mit "openssl rand -hex 32" erzeugt werden (64 Zeichen).'),

  // Modus A: geteilter Zugang zum Konsolen-Postfach. Optional, weil ein
  // Betrieb ohne Modus-A-Kunden (nur Modus B) diese Vars nicht braucht --
  // main.ts prüft zur Laufzeit, ob mindestens eine weiterleitung-Anbindung
  // aktiv ist, und verlangt die Vars dann nachträglich.
  KONSOLEN_POSTFACH_IMAP_HOST: z.string().min(1).optional(),
  KONSOLEN_POSTFACH_IMAP_PORT: z.coerce.number().int().positive().optional(),
  KONSOLEN_POSTFACH_IMAP_USER: z.string().min(1).optional(),
  KONSOLEN_POSTFACH_IMAP_PASS: z.string().min(1).optional(),

  HEALTH_PORT: z.coerce.number().int().positive().default(3001),
  FALLBACK_POLL_INTERVALL_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function ladeEnv(quelle: NodeJS.ProcessEnv = process.env): Env {
  const ergebnis = envSchema.safeParse(quelle);
  if (!ergebnis.success) {
    const meldungen = ergebnis.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    throw new Error(`Ungültige Umgebungsvariablen für apps/mail-ingest:\n${meldungen.join('\n')}`);
  }
  return ergebnis.data;
}

export function pruefeKonsolenPostfachEnv(env: Env): asserts env is Env & {
  KONSOLEN_POSTFACH_IMAP_HOST: string;
  KONSOLEN_POSTFACH_IMAP_PORT: number;
  KONSOLEN_POSTFACH_IMAP_USER: string;
  KONSOLEN_POSTFACH_IMAP_PASS: string;
} {
  const fehlend = (
    ['KONSOLEN_POSTFACH_IMAP_HOST', 'KONSOLEN_POSTFACH_IMAP_PORT', 'KONSOLEN_POSTFACH_IMAP_USER', 'KONSOLEN_POSTFACH_IMAP_PASS'] as const
  ).filter((schluessel) => env[schluessel] === undefined);

  if (fehlend.length > 0) {
    throw new Error(
      `Es gibt mindestens eine aktive weiterleitung-Anbindung (Modus A), aber folgende Env-Vars fehlen: ${fehlend.join(', ')}.`,
    );
  }
}
