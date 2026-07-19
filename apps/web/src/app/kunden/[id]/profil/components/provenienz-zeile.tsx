// Dezente Herkunfts-Zeile, "analog zu einer wissenschaftlichen Fußnote"
// (Issue #50, Aufgabe B/E) -- nie versteckt (kein Tooltip), aber optisch
// zurückhaltend (klein, kursiv, gedeckte Warnfarbe statt Fließtext-Schwarz).

export function ProvenienzZeile({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="mt-1 text-xs italic text-warning">{text}</p>;
}
