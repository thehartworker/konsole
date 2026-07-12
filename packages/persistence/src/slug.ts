// Auflösung von routing.person_slug (aus dem Klassifikations-Output, §3.4)
// zu einer nutzer.id. Siehe docs/decisions/2026-07-12_klassifikations-layer.md,
// Nachtrag Teil 2: nutzer hat keine slug-Spalte, deshalb wird der Slug
// deterministisch aus nutzer.name abgeleitet und verglichen. Pragmatische
// Implementierung, keine wörtliche Spec-Vorgabe (nur ein Beispiel in §3.4:
// "julia_schmidt").
//
// Bewusst kein Einsatz von AGENTS.md §3.5 ("Umlaute nie als ae/oe/ue"): das
// gilt für deutschsprachige Prosa (Prompts, UI-Texte), nicht für technische
// Slug-Identifikatoren -- die bestehenden Slugs im Datenmodell
// (agenturen.slug, kunden.slug, z. B. "baeckerei-hoffmann" aus dem
// SAAS_SPEC-Beispiel) folgen demselben ASCII-Transliterations-Muster.

const UMLAUT_TRANSLITERATION: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
};

// Nach String.normalize('NFD') sind Basiszeichen wie "é" in Basiszeichen
// plus kombinierendes diakritisches Zeichen zerlegt (z. B. "e" + U+0301).
// Codepoint-Bereich statt Regex-Literal, damit der Unicode-Block (U+0300 bis
// U+036F, "Combining Diacritical Marks") im Quelltext eindeutig als Zahl
// statt als schwer unterscheidbares Glyphen-Literal sichtbar bleibt.
function entferneKombinierendeDiakritika(text: string): string {
  return Array.from(text)
    .filter((zeichen) => {
      const codepoint = zeichen.codePointAt(0) ?? 0;
      return codepoint < 0x0300 || codepoint > 0x036f;
    })
    .join('');
}

export function slugifiziereName(name: string): string {
  const transliteriert = name
    .toLowerCase()
    .replace(/[äöüß]/g, (zeichen) => UMLAUT_TRANSLITERATION[zeichen] ?? zeichen);

  return entferneKombinierendeDiakritika(transliteriert.normalize('NFD'))
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Löst routing.person_slug gegen die Nutzer-Liste einer Agentur auf.
 * Kein Treffer (oder person_slug === null) -> null, wie im Auftrag
 * gefordert ("falls vorhanden, sonst NULL"). Bei mehreren Treffern (Namens-
 * Kollision) wird der erste genommen -- ein bekannter, dokumentierter
 * Kompromiss, siehe Nachtrag in der Design-Decision.
 */
export function loeseNutzerIdAusPersonSlug(
  personSlug: string | null,
  nutzerListe: Array<{ id: string; name: string }>,
): string | null {
  if (!personSlug) return null;

  const treffer = nutzerListe.find((nutzer) => slugifiziereName(nutzer.name) === personSlug);
  return treffer?.id ?? null;
}
