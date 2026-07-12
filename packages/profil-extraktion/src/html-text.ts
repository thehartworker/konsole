// Einfache, aber echte HTML-zu-Text-Extraktion (Teil 1, PR 2). Wird sowohl
// von der produktiven WebsiteTextProvider-Implementierung (gescrapte Seiten)
// als auch vom HTML-Zweig der produktiven DokumentTextProvider-Implementierung
// (hochgeladene .html-Dateien) genutzt. Bewusst kein vollständiger
// HTML5-Parser/DOM (keine zusätzliche Abhängigkeit für den reinen
// Fließtext-Bedarf der KI-Extraktion) -- entfernt script/style/Kommentare,
// wandelt Block-Elemente in Zeilenumbrüche, dekodiert die gängigen deutschen
// HTML-Entities, kollabiert Whitespace pro Zeile.

const UNSICHTBARE_BLOECKE = [/<!--[\s\S]*?-->/g, /<script[\s\S]*?<\/script>/gi, /<style[\s\S]*?<\/style>/gi];

const ZEILENUMBRUCH_TAGS = /<\/?(p|div|br|li|h[1-6]|tr|table|section|article|header|footer|nav|ul|ol)\b[^>]*>/gi;

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
};

function entitiesDekodieren(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_treffer, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_treffer, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(\w+);/g, (treffer, name: string) => ENTITY_MAP[name] ?? treffer);
}

export function htmlZuText(html: string): string {
  let bereinigt = html;
  for (const muster of UNSICHTBARE_BLOECKE) {
    bereinigt = bereinigt.replace(muster, '');
  }

  // Rohes Formatierungs-Whitespace aus dem HTML-Quelltext selbst (Einrückung,
  // Zeilenumbrüche zwischen Tags) hat KEINE semantische Bedeutung -- erst
  // NACH dieser Kollabierung werden die erkannten Block-Tags gezielt zu
  // echten Zeilenumbrüchen. Sonst würde jeder zufällige Quelltext-
  // Zeilenumbruch als Absatzgrenze erscheinen.
  const ohneRohesWhitespace = bereinigt.replace(/\s+/g, ' ');

  const mitZeilenumbruechen = ohneRohesWhitespace.replace(ZEILENUMBRUCH_TAGS, '\n');
  const ohneTags = mitZeilenumbruechen.replace(/<[^>]+>/g, ' ');
  const dekodiert = entitiesDekodieren(ohneTags);

  return dekodiert
    .split('\n')
    .map((zeile) => zeile.replace(/\s+/g, ' ').trim())
    .filter((zeile) => zeile.length > 0)
    .join('\n')
    .trim();
}
