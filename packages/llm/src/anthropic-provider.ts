// Einzige v1-Implementation von LLMProvider (SAAS_SPEC_v1.0_CONSOLE.md §3.5).
// Nutzt fetch() direkt statt des Anthropic-SDK, damit der Retry-Wrapper aus
// AGENTS.md §7.4 (der auf einer rohen Response operiert) unverändert gilt.

import { callLLMWithRetry } from './retry.js';
import type {
  LLMProvider,
  StrukturierteCompletionAnfrage,
  StrukturierteCompletionErgebnis,
} from './types.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicMessagesResponse {
  content: AnthropicContentBlock[];
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

export interface AnthropicProviderOptions {
  /** Zentraler Key. Default: process.env.ANTHROPIC_API_KEY (AGENTS.md §4, keine Secrets im Code). */
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export class AnthropicProvider implements LLMProvider {
  private readonly zentralerApiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AnthropicProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY fehlt: weder Env-Variable noch AnthropicProviderOptions.apiKey gesetzt.',
      );
    }
    this.zentralerApiKey = apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async strukturierteCompletion(
    anfrage: StrukturierteCompletionAnfrage,
  ): Promise<StrukturierteCompletionErgebnis> {
    // Modell A (verbindlich, siehe Auftrag): v1 nutzt immer den zentralen Key.
    // anfrage.apiKey existiert im Interface für einen späteren agentur-
    // spezifischen Key, wird hier aber schon respektiert, falls doch gesetzt.
    const apiKey = anfrage.apiKey ?? this.zentralerApiKey;

    // Assistant-Prefill mit "{" biast das Modell auf valides JSON ohne
    // Markdown-Fences oder Vorrede, ohne dass die Anthropic-API ein
    // natives JSON-Mode-Flag bräuchte.
    const response = await callLLMWithRetry<AnthropicMessagesResponse>(() =>
      this.fetchImpl(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: anfrage.model,
          max_tokens: anfrage.max_tokens,
          system: anfrage.system,
          messages: [
            { role: 'user', content: anfrage.prompt },
            { role: 'assistant', content: '{' },
          ],
        }),
      }),
    );

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock?.text) {
      throw new Error('Anthropic-Antwort enthält keinen Text-Block.');
    }

    return {
      text: '{' + textBlock.text,
      tokenVerbrauch: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
      modell: response.model,
    };
  }
}
