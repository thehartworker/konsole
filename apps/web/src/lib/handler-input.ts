// Bildet ein persistiertes anliegen (beschreibung + backend_handler_input,
// aus der Klassifikation) auf den vollen W1-/W2-Input-Kontrakt ab. Eine
// grobe v1-Näherung: backend_handler_input aus der Klassifikation ist
// deutlich schlanker als W1BriefingInput/W2AnfrageInput. Ein eigenes
// Briefing-Formular ist nicht Teil dieses Blocks (Inline-Editing ist
// "Block 2"). Siehe
// docs/decisions/2026-07-13_konsole-block1-vorgangs-detailansicht.md,
// Abschnitt 6.

import type { W1BriefingInput, W1LaengeZiel, W2AnfrageInput, W2FormatGewuenscht } from "@konsole/handlers";
import type { AnliegenZeile } from "./vorgaenge";

function textFeld(input: Record<string, unknown>, feld: string): string | null {
  const wert = input[feld];
  return typeof wert === "string" && wert.trim().length > 0 ? wert : null;
}

function stringArrayFeld(input: Record<string, unknown>, feld: string): string[] {
  const wert = input[feld];
  if (!Array.isArray(wert)) return [];
  return wert.filter((eintrag): eintrag is string => typeof eintrag === "string");
}

const W1_LAENGE_WERTE: readonly W1LaengeZiel[] = ["kurz", "standard", "lang"];
const W2_FORMAT_WERTE: readonly W2FormatGewuenscht[] = [
  "schriftliche_antworten",
  "interview_termin",
  "hintergrund_gespraech",
  "statement",
];

export function briefingAusAnliegen(anliegen: AnliegenZeile): W1BriefingInput {
  const input = anliegen.backend_handler_input ?? {};
  const laengeRoh = textFeld(input, "laenge_ziel");
  const laengeZiel = W1_LAENGE_WERTE.find((wert) => wert === laengeRoh) ?? "standard";

  return {
    anlass: textFeld(input, "anlass") ?? anliegen.beschreibung,
    kernbotschaft: textFeld(input, "kernbotschaft"),
    fakten: stringArrayFeld(input, "fakten"),
    zitat_sprecher: textFeld(input, "zitat_sprecher"),
    zitat_kernaussage: textFeld(input, "zitat_kernaussage"),
    ziel_medien_gruppe: textFeld(input, "ziel_medien_gruppe"),
    boilerplate_referenz: textFeld(input, "boilerplate_referenz"),
    laenge_ziel: laengeZiel,
    sperrfrist_at: textFeld(input, "sperrfrist_at") ?? anliegen.frist_erschlossen,
    zusatz_hinweis: textFeld(input, "zusatz_hinweis"),
  };
}

export function anfrageAusAnliegen(anliegen: AnliegenZeile): W2AnfrageInput {
  const input = anliegen.backend_handler_input ?? {};
  const formatRoh = textFeld(input, "format_gewuenscht");
  const formatGewuenscht = W2_FORMAT_WERTE.find((wert) => wert === formatRoh) ?? "schriftliche_antworten";

  return {
    medium_name: textFeld(input, "medium_name") ?? "unbekanntes Medium",
    journalist_name: textFeld(input, "journalist_name"),
    journalist_kontakt: textFeld(input, "journalist_kontakt"),
    ressort: textFeld(input, "ressort"),
    thema_beschreibung: textFeld(input, "thema_beschreibung") ?? anliegen.beschreibung,
    frist_at: textFeld(input, "frist_at") ?? anliegen.frist_erschlossen,
    fragen_woertlich: stringArrayFeld(input, "fragen_woertlich"),
    format_gewuenscht: formatGewuenscht,
    sprecher_vorgeschlagen: textFeld(input, "sprecher_vorgeschlagen"),
    sprecher_rolle: textFeld(input, "sprecher_rolle"),
  };
}
