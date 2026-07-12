// Mock-LLMProvider für Tests: kein echter Netzwerk-Call, kein Secret in CI
// nötig. Liefert definierte Antworten (inklusive definiertem Token-Verbrauch)
// aus einer vorkonfigurierten Liste, der Reihe nach.

import type {
  LLMProvider,
  StrukturierteCompletionAnfrage,
  StrukturierteCompletionErgebnis,
} from '../types.js';

export type MockAntwort = Omit<StrukturierteCompletionErgebnis, 'modell'> & {
  modell?: string;
};

export interface MockLLMProviderOptions {
  antworten: MockAntwort[];
}

export class MockLLMProvider implements LLMProvider {
  private aufrufIndex = 0;
  readonly aufrufe: StrukturierteCompletionAnfrage[] = [];

  constructor(private readonly options: MockLLMProviderOptions) {}

  async strukturierteCompletion(
    anfrage: StrukturierteCompletionAnfrage,
  ): Promise<StrukturierteCompletionErgebnis> {
    this.aufrufe.push(anfrage);
    const antwort = this.options.antworten[this.aufrufIndex] ?? this.options.antworten.at(-1);
    this.aufrufIndex += 1;
    if (!antwort) {
      throw new Error('MockLLMProvider: keine Antwort konfiguriert.');
    }
    return { modell: 'mock-model', ...antwort };
  }
}
