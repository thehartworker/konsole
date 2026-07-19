// Health-Endpoint (Issue #52, Aufgabe C): einfacher HTTP-Server auf Port
// 3001 (Default), "/health" liefert JSON für Uptime-Robot und systemd.

import { createServer, type Server } from 'node:http';
import type { VerbindungsStatus } from './verbindung.js';

export interface HealthPayload {
  status: 'ok';
  verbindungen_aktiv: number;
  letzte_mail_at: string | null;
}

export function baueHealthPayload(verbindungen: VerbindungsStatus[]): HealthPayload {
  const letzteMailAt =
    verbindungen
      .map((v) => v.letzteMailAt)
      .filter((wert): wert is string => wert !== null)
      .sort()
      .at(-1) ?? null;

  return { status: 'ok', verbindungen_aktiv: verbindungen.length, letzte_mail_at: letzteMailAt };
}

export function starteHealthServer(port: number, verbindungen: VerbindungsStatus[]): Server {
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(baueHealthPayload(verbindungen)));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ fehler: 'not found' }));
  });

  server.listen(port);
  return server;
}
