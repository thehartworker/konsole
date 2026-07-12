// Fake-WebsiteTextProvider für Tests: kein echter Netzwerk-Zugriff, liefert
// definierten Text pro Kunde (siehe docs/decisions/2026-07-12_kundenprofil-ki-befuellung.md,
// Abschnitt "Teil 1").

import type { ExtrahierterText, KundenWebsiteQuelle, WebsiteTextProvider } from '../types.js';

export interface FakeWebsiteTextProviderOptions {
  /** Schlüssel: kundeId. */
  seitenNachKundeId: Record<string, ExtrahierterText[]>;
}

export class FakeWebsiteTextProvider implements WebsiteTextProvider {
  readonly angefragteQuellen: KundenWebsiteQuelle[] = [];

  constructor(private readonly options: FakeWebsiteTextProviderOptions) {}

  async textDerRelevantenSeitenLaden(website: KundenWebsiteQuelle): Promise<ExtrahierterText[]> {
    this.angefragteQuellen.push(website);
    return this.options.seitenNachKundeId[website.kundeId] ?? [];
  }
}
