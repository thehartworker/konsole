// Strukturiertes JSON-Logging (Issue #52, Aufgabe C) über pino, damit der
// systemd-journal-Reader (journalctl -u konsole-mail-ingest -o json) das
// lesbar hat.

import pino from 'pino';

export type Logger = pino.Logger;

export function baueLogger(level = process.env.LOG_LEVEL ?? 'info'): Logger {
  return pino({ level, base: { dienst: 'mail-ingest' } });
}
