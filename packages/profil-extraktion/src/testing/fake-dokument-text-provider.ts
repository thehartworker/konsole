// Fake-DokumentTextProvider für Tests: kein echtes PDF-/Word-Parsing, liefert
// definierten Text (siehe docs/decisions/2026-07-12_kundenprofil-ki-befuellung.md,
// Abschnitt "Teil 1").

import type { DokumentTextProvider, ExtrahierterText, HochgeladeneDatei } from '../types.js';

export interface FakeDokumentTextProviderOptions {
  /** Schlüssel: quelldokumentId. Wirft, wenn eine unbekannte Datei angefragt wird (Test-Fehler, nicht stillschweigend leerer Text). */
  textNachQuelldokumentId: Record<string, string>;
}

export class FakeDokumentTextProvider implements DokumentTextProvider {
  readonly angefragteDateien: HochgeladeneDatei[] = [];

  constructor(private readonly options: FakeDokumentTextProviderOptions) {}

  async textExtrahieren(datei: HochgeladeneDatei): Promise<ExtrahierterText> {
    this.angefragteDateien.push(datei);
    const text = this.options.textNachQuelldokumentId[datei.quelldokumentId];
    if (text === undefined) {
      throw new Error(`FakeDokumentTextProvider: kein Text für quelldokumentId "${datei.quelldokumentId}" konfiguriert.`);
    }
    return { bezeichnung: datei.dateiname, text };
  }
}
