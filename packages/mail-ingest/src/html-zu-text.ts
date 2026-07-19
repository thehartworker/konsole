// Minimaler HTML-zu-Text-Konverter für den Fall, dass eine Mail keinen
// text/plain-Teil hat (Issue #52, Aufgabe B). Bewusst kein zusätzliches
// npm-Paket dafür: die Anforderung ist "lesbarer Fließtext für die
// Klassifikation", keine layout-treue Konvertierung -- Block-Elemente werden
// zu Zeilenumbrüchen, alles andere zu Text ohne Tags.

const BLOCK_ELEMENTE = /<\/(p|div|br|li|tr|h[1-6]|blockquote)>/gi;
const ZEILENUMBRUCH_TAG = /<br\s*\/?>/gi;
const ALLE_TAGS = /<[^>]+>/g;

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function entitiesDekodieren(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (treffer) => ENTITY_MAP[treffer] ?? treffer);
}

export function htmlZuText(html: string): string {
  const ohneSkriptUndStyle = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const mitZeilenumbruechen = ohneSkriptUndStyle
    .replace(ZEILENUMBRUCH_TAG, '\n')
    .replace(BLOCK_ELEMENTE, '\n');
  const ohneTags = mitZeilenumbruechen.replace(ALLE_TAGS, '');
  const dekodiert = entitiesDekodieren(ohneTags);

  return dekodiert
    .split('\n')
    .map((zeile) => zeile.replace(/[ \t]+/g, ' ').trim())
    .filter((zeile, index, alle) => zeile.length > 0 || (index > 0 && alle[index - 1].length > 0))
    .join('\n')
    .trim();
}
