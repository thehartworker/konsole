// LLM-Provider-Abstraktion (AGENTS.md §2, SAAS_SPEC_v1.0_CONSOLE.md §3.5).
// Anthropic ist in v1 die einzige Implementation (siehe anthropic-provider.ts),
// aber Klassifikations- und Handler-Code hängen nur von diesem Interface ab.

export interface TokenVerbrauch {
  input_tokens: number;
  output_tokens: number;
}

export interface StrukturierteCompletionAnfrage {
  /** Rollen- und Regel-Text, ändert sich nicht pro Aufruf innerhalb eines Zwecks. */
  system: string;
  /** Der eigentliche Fall (Nachricht, Kontext), ändert sich pro Aufruf. */
  prompt: string;
  model: string;
  max_tokens: number;
  /**
   * Optionaler agentur-spezifischer Key. In v1 ungenutzt (Modell A: ein
   * zentraler Key für alle Agenturen), das Interface sieht ihn aber vor,
   * damit ein späterer Enterprise-Kunde mit eigenem Key ohne Interface-
   * Bruch nachgerüstet werden kann (siehe docs/decisions/2026-07-12_klassifikations-layer.md).
   */
  apiKey?: string;
}

export interface StrukturierteCompletionErgebnis {
  /** Der rohe Text-Output des Modells, unvalidiert. Der Aufrufer validiert selbst (z. B. per Zod). */
  text: string;
  tokenVerbrauch: TokenVerbrauch;
  modell: string;
}

export interface LLMProvider {
  strukturierteCompletion(
    anfrage: StrukturierteCompletionAnfrage,
  ): Promise<StrukturierteCompletionErgebnis>;
}
