// Einstiegspunkt apps/mail-ingest (Issue #52, Aufgabe C). Liest Env-Vars,
// verbindet zu Supabase (Service-Role), holt alle aktiven
// kunden_mail_anbindungen, startet eine geteilte Verbindung für Modus A
// (falls nötig) und eine Verbindung pro Modus-B-Anbindung.

import { createClient } from '@supabase/supabase-js';
import { AnthropicProvider } from '@konsole/llm';
import { ProduktiverImapClient } from '@konsole/mail-ingest';
import { SupabaseKlassifikationsRepository } from '@konsole/persistence';
import { ladeEnv, pruefeKonsolenPostfachEnv } from './env.js';
import { starteHealthServer } from './health-server.js';
import { baueLogger } from './logger.js';
import { SupabaseMailIngestRepository } from './supabase-repository.js';
import type { VerarbeiteNachrichtAbhaengigkeiten } from './verarbeite-nachricht.js';
import { starteVerbindung, type AktiveVerbindung, type VerbindungsStatus } from './verbindung.js';

async function main() {
  const env = ladeEnv();
  const logger = baueLogger(env.LOG_LEVEL);

  const supabaseClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const repo = new SupabaseMailIngestRepository(supabaseClient);
  const klassifikationsRepo = new SupabaseKlassifikationsRepository(supabaseClient);
  const provider = new AnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY });

  const abhaengigkeiten: VerarbeiteNachrichtAbhaengigkeiten = {
    repo,
    klassifikationsRepo,
    provider,
    supabaseClient,
    logger,
  };

  const alleAnbindungen = await repo.aktiveAnbindungenLaden();
  const weiterleitungsAnbindungen = alleAnbindungen.filter((a) => a.anbindungsTyp === 'weiterleitung');
  const modusBAnbindungen = alleAnbindungen.filter((a) => a.anbindungsTyp === 'imap_kundenpostfach');

  const aktiveVerbindungen: AktiveVerbindung[] = [];
  const statusListe: VerbindungsStatus[] = [];

  if (weiterleitungsAnbindungen.length > 0) {
    pruefeKonsolenPostfachEnv(env);
    const status: VerbindungsStatus = { bezeichnung: 'konsolen-postfach', letzteMailAt: null };
    statusListe.push(status);

    const imapClient = new ProduktiverImapClient({
      host: env.KONSOLEN_POSTFACH_IMAP_HOST,
      port: env.KONSOLEN_POSTFACH_IMAP_PORT,
      benutzername: env.KONSOLEN_POSTFACH_IMAP_USER,
      passwort: env.KONSOLEN_POSTFACH_IMAP_PASS,
    });

    aktiveVerbindungen.push(
      await starteVerbindung({
        bezeichnung: 'konsolen-postfach',
        imapClient,
        verarbeitetOrdner: 'Verarbeitet',
        anbindungenLaden: () => repo.aktiveAnbindungenLaden(),
        abhaengigkeiten,
        fallbackPollIntervallMs: env.FALLBACK_POLL_INTERVALL_MS,
        status,
      }),
    );
  } else {
    logger.info('Keine aktive weiterleitung-Anbindung -- Modus A wird nicht gestartet.');
  }

  for (const anbindung of modusBAnbindungen) {
    const verbindungsdaten = await repo.modusBVerbindungsdatenLaden(anbindung.id);
    if (!verbindungsdaten) {
      logger.error({ anbindungId: anbindung.id }, 'Modus-B-Anbindung ohne vollständige Verbindungsdaten, überspringe.');
      continue;
    }

    const passwort = await repo.passwortEntschluesseln(anbindung.id, env.IMAP_PASSWORT_VERSCHLUESSELUNGS_SCHLUESSEL);
    if (!passwort) {
      logger.error({ anbindungId: anbindung.id }, 'Konnte IMAP-Passwort nicht entschlüsseln, überspringe Anbindung.');
      continue;
    }

    const status: VerbindungsStatus = { bezeichnung: `kunde-${anbindung.kundeId}`, letzteMailAt: null };
    statusListe.push(status);

    const imapClient = new ProduktiverImapClient({
      host: verbindungsdaten.imapHost,
      port: verbindungsdaten.imapPort,
      benutzername: verbindungsdaten.imapBenutzername,
      passwort,
      ordner: verbindungsdaten.imapOrdner,
    });

    aktiveVerbindungen.push(
      await starteVerbindung({
        bezeichnung: status.bezeichnung,
        imapClient,
        verarbeitetOrdner: verbindungsdaten.verarbeitetOrdner,
        anbindungenLaden: () => Promise.resolve([anbindung]),
        zuordnungsOptionen: { modusBAnbindungId: anbindung.id },
        abhaengigkeiten,
        fallbackPollIntervallMs: env.FALLBACK_POLL_INTERVALL_MS,
        status,
      }),
    );
  }

  const healthServer = starteHealthServer(env.HEALTH_PORT, statusListe);
  logger.info({ port: env.HEALTH_PORT, verbindungen: statusListe.length }, 'apps/mail-ingest gestartet');

  let wirdBeendet = false;
  const graceful = async (signal: string) => {
    if (wirdBeendet) return;
    wirdBeendet = true;
    logger.info({ signal }, 'Beende apps/mail-ingest, schließe Verbindungen...');
    await Promise.all(aktiveVerbindungen.map((verbindung) => verbindung.stoppen()));
    healthServer.close();
    logger.info('Alle Verbindungen geschlossen, beende Prozess.');
    process.exit(0);
  };

  process.on('SIGTERM', () => void graceful('SIGTERM'));
  process.on('SIGINT', () => void graceful('SIGINT'));
}

main().catch((fehler) => {
  // eslint-disable-next-line no-console -- Logger ist an dieser Stelle ggf. noch nicht aufgebaut.
  console.error('apps/mail-ingest: Start fehlgeschlagen:', fehler);
  process.exit(1);
});
