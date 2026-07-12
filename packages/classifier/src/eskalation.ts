// Eskalations-Hardrule (SAAS_SPEC_v1.0_CONSOLE.md §3.3), laut AGENTS.md §4
// "unantastbar": bei sensitiven Vorgängen wird deterministisch durchgesetzt,
// nicht nur validiert. Ein LLM-Output, der die Regel verletzt, wird hier
// korrigiert statt den gesamten Vorgang zu verwerfen (siehe Design-Decision,
// "Zu 3" für die Begründung).

import type { KlassifikationsErgebnis } from './schema.js';

const ESKALATIONS_TYPEN = ['Freigabe', 'Issue', 'Krise'] as const;

export function erfordertEskalation(
  ergebnis: Pick<KlassifikationsErgebnis, 'sensitivity' | 'typ_primaer'>,
): boolean {
  return (
    ergebnis.sensitivity !== 'normal' ||
    (ESKALATIONS_TYPEN as readonly string[]).includes(ergebnis.typ_primaer)
  );
}

/** Neutrale Empfangsbestätigung, wörtlich aus §3.3 übernommen. */
export function neutraleEmpfangsbestaetigung(
  absenderName: string | null,
  zustaendigePerson: string,
): string {
  const anrede = absenderName ? `Hallo ${absenderName}` : 'Hallo';
  return `${anrede}, deine Nachricht ist angekommen und liegt bei ${zustaendigePerson}. Sie meldet sich schnellstmöglich.`;
}

/**
 * Erzwingt §3.3 unabhängig vom LLM-Output: rueckfragen = [],
 * rueckfrage_nachricht = null, antwort_nachricht = neutrale Bestätigung.
 * Gibt das Ergebnis unverändert zurück, wenn keine Eskalation vorliegt.
 */
export function erzwingeEskalationsHardrule(
  ergebnis: KlassifikationsErgebnis,
): KlassifikationsErgebnis {
  if (!erfordertEskalation(ergebnis)) {
    return ergebnis;
  }

  const zustaendigePerson = ergebnis.routing.person_slug ?? ergebnis.routing.rolle;

  return {
    ...ergebnis,
    rueckfragen: [],
    rueckfrage_nachricht: null,
    antwort_nachricht: neutraleEmpfangsbestaetigung(ergebnis.felder.absender_name, zustaendigePerson),
  };
}
