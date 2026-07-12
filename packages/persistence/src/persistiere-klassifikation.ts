// Aufgabe A (Issue #30): validierten Klassifikations-Output RLS-konform
// persistieren. vorgaenge/anliegen/audit_log, klassifikation_status
// queued -> in_progress -> done, bei Fehler failed, "kein halber Vorgang".
// Siehe docs/decisions/2026-07-12_klassifikations-layer.md, Nachtrag Teil 2
// für die Architektur-Begründung (Repository-Interface, Kompensations-Muster
// statt echter Mehr-Tabellen-Transaktion).

import { autonomieErlaubtAutomatischenVersand } from './autonomie.js';
import { loeseNutzerIdAusPersonSlug } from './slug.js';
import type {
  KlassifikationsRepository,
  PersistiereKlassifikationEingabe,
  PersistiereKlassifikationResultat,
} from './types.js';

/**
 * Schreibt einen ERFOLGREICHEN Klassifikations-Output (bereits Zod-validiert
 * und Hardrule-durchgesetzt in packages/classifier) in die Datenbank:
 * anliegen[], vorgaenge-Update (Klassifikations-Felder + status='done'),
 * audit_log-Eintrag. Bei einem Fehler nach dem anliegen-Insert werden die
 * bereits eingefügten anliegen-Zeilen kompensierend soft-gelöscht und
 * klassifikation_status wird explizit auf 'failed' gesetzt -- nie bleibt ein
 * Vorgang mit teilweise geschriebenen anliegen und undefiniertem Status
 * zurück.
 */
export async function persistiereErfolgreicheKlassifikation(
  eingabe: PersistiereKlassifikationEingabe,
  repo: KlassifikationsRepository,
): Promise<PersistiereKlassifikationResultat> {
  const { vorgangId, kundeId, ergebnis } = eingabe;

  const kunde = await repo.kundeLaden(kundeId);
  if (!kunde) {
    throw new Error(`persistiereKlassifikation: kunde ${kundeId} existiert nicht oder ist gelöscht.`);
  }

  // Routing-Auflösung (Nachtrag Teil 2 in der Design-Decision): person_slug
  // wird gegen die Nutzer-Liste DERSELBEN Agentur aufgelöst, die wir gerade
  // per kundeLaden() ermittelt haben -- kein vom Aufrufer übergebener Wert.
  const nutzerListe = await repo.nutzerFuerAgenturLaden(kunde.agentur_id);
  const zustaendigeNutzerId = loeseNutzerIdAusPersonSlug(ergebnis.routing.person_slug, nutzerListe);

  // routing.verteiler (§3.4) enthält person_slugs, keine nutzer.id -- die
  // Spalte vorgaenge.routing_verteiler ist aber uuid[]
  // (docs/decisions/2026-07-10_datenmodell.md: "fk[] nutzer, routing.verteiler").
  // Jeder Slug wird deshalb genauso aufgelöst wie person_slug; nicht
  // auflösbare Slugs werden verworfen statt den gesamten Vorgang scheitern zu
  // lassen (kein Pflichtfeld laut Schema, §3.4 z.array(z.string())).
  const routingVerteilerNutzerIds = ergebnis.routing.verteiler
    .map((slug) => loeseNutzerIdAusPersonSlug(slug, nutzerListe))
    .filter((id): id is string => id !== null);

  let eingefuegteAnliegenIds: string[] = [];

  try {
    eingefuegteAnliegenIds = await repo.anliegenEinfuegen(
      vorgangId,
      ergebnis.anliegen.map((anliegen) => ({
        beschreibung: anliegen.beschreibung,
        prioritaet: anliegen.prioritaet,
        frist_erschlossen: anliegen.frist_erschlossen,
        frist_annahme: anliegen.frist_annahme,
        backend_handler_vorschlag: anliegen.backend_handler_vorschlag,
        backend_handler_input: anliegen.backend_handler_input,
      })),
    );

    await repo.vorgangKlassifikationAbschliessen(
      vorgangId,
      {
        sprache_ausgang: ergebnis.sprache_ausgang,
        typ_primaer: ergebnis.typ_primaer,
        typ_sekundaer: ergebnis.typ_sekundaer,
        confidence: ergebnis.confidence,
        sensitivity: ergebnis.sensitivity,
        prioritaet: ergebnis.prioritaet,
        routing_rolle: ergebnis.routing.rolle,
        routing_verteiler: routingVerteilerNutzerIds,
        zustaendige_nutzer_id: zustaendigeNutzerId,
      },
      new Date().toISOString(),
    );

    // Shadow-Mode-Durchsetzung (§5.1, Aufgabe C): in v1 gibt es keinen
    // Code-Pfad, der einen Handler auslöst oder etwas versendet (siehe
    // Design-Decision, "Grenze Klassifikation/Handler-Auslösung" -- Persistenz
    // ist das Ende der Kette). Die Prüfung läuft trotzdem explizit und wird
    // im audit_log protokolliert, damit "bei Stufe 1 wird nachweislich kein
    // Handler ausgelöst" nicht nur durch Abwesenheit von Code gilt, sondern
    // durch einen geprüften, sichtbaren Wert.
    const automatischerVersandErlaubt = autonomieErlaubtAutomatischenVersand(kunde.autonomie_level);

    await repo.auditLogSchreiben({
      agentur_id: kunde.agentur_id,
      vorgang_id: vorgangId,
      aktion: 'klassifikation_abgeschlossen',
      aktion_payload: {
        audit_summary: ergebnis.audit_summary,
        typ_primaer: ergebnis.typ_primaer,
        sensitivity: ergebnis.sensitivity,
        anliegen_anzahl: ergebnis.anliegen.length,
        autonomie_level: kunde.autonomie_level,
        automatischer_versand_erlaubt: automatischerVersandErlaubt,
      },
    });

    return { status: 'done', vorgangId, anliegenIds: eingefuegteAnliegenIds };
  } catch (fehler) {
    if (eingefuegteAnliegenIds.length > 0) {
      await repo.anliegenLoeschen(eingefuegteAnliegenIds);
    }
    await repo.vorgangStatusSetzen(vorgangId, 'failed', {
      klassifikation_beendet_at: new Date().toISOString(),
    });

    return {
      status: 'failed',
      vorgangId,
      fehler: fehler instanceof Error ? fehler.message : String(fehler),
    };
  }
}
