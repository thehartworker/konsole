// Gemeinsames JSON-Extraktions-Helper für alle W2-LLM-Aufrufe, gleiche Logik
// wie packages/classifier/src/classify.ts (LLMs verpacken JSON manchmal trotz
// Anweisung in Markdown-Code-Fences).

export function extractJson(text: string): string {
  const ohneFences = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
  return ohneFences.trim();
}
