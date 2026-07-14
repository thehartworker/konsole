import type { KritikerFinding, RegelVerstoss, W1Output, W2Output } from "@konsole/handlers";
import { W1_HANDLER_SLUG } from "@konsole/handlers";
import type { HandlerAufrufZeile } from "@/lib/vorgaenge";
import { HANDLER_LABEL } from "./labels";

interface VerstossMitHandler extends RegelVerstoss {
  handlerLabel: string;
}

interface FindingMitHandler extends KritikerFinding {
  handlerLabel: string;
}

function sammleVerstoesseUndFindings(handlerAufrufe: HandlerAufrufZeile[]): {
  verstoesse: VerstossMitHandler[];
  hoheFindings: FindingMitHandler[];
  nichtVerfuegbareHandler: string[];
} {
  const verstoesse: VerstossMitHandler[] = [];
  const hoheFindings: FindingMitHandler[] = [];
  const nichtVerfuegbareHandler: string[] = [];

  for (const eintrag of handlerAufrufe) {
    if (eintrag.status !== "done" || !eintrag.ergebnis) continue;
    const handlerLabel = HANDLER_LABEL[eintrag.handler_slug] ?? eintrag.handler_slug;
    // ergebnis_bearbeitet ?? ergebnis, wie überall in der Anzeige (Issue #45,
    // Verbindliche Vorgabe 1) -- ein Edit ändert nur pressemitteilung, nicht
    // kritiker_findings/grenz_pruefung_ergebnis, aber die Anzeige liest
    // konsistent denselben Quell-Vorrang wie die Editor-Ansicht.
    const quelle = eintrag.ergebnis_bearbeitet ?? eintrag.ergebnis;

    // Issue #47: ein unvollständiges Handler-Ergebnis (z. B. aus einem noch
    // nicht Zod-validierten Zwischenstand) darf das Panel nicht crashen
    // lassen -- gerade hier soll die Beraterin erfahren, dass etwas nicht
    // stimmt, statt dass die ganze Detailansicht mitreißt. Fehlende
    // Teil-Objekte werden als "nicht verfügbar" markiert, fehlende Arrays
    // wie eine leere Liste behandelt.
    if (eintrag.handler_slug === W1_HANDLER_SLUG) {
      const output = quelle as unknown as Partial<W1Output>;
      if (!output.grenz_pruefung_ergebnis) {
        nichtVerfuegbareHandler.push(handlerLabel);
      } else {
        for (const verstoss of output.grenz_pruefung_ergebnis.verstoesse ?? []) {
          verstoesse.push({ ...verstoss, handlerLabel });
        }
      }
      for (const finding of output.kritiker_findings ?? []) {
        if (finding.schweregrad === "hoch") {
          hoheFindings.push({ ...finding, handlerLabel });
        }
      }
    } else {
      const output = quelle as unknown as Partial<W2Output>;
      if (!output.pruefung) {
        nichtVerfuegbareHandler.push(handlerLabel);
      } else {
        for (const verstoss of output.pruefung.verstoesse ?? []) {
          verstoesse.push({ ...verstoss, handlerLabel });
        }
      }
    }
  }

  return { verstoesse, hoheFindings, nichtVerfuegbareHandler };
}

export function CompliancePanel({ handlerAufrufe }: { handlerAufrufe: HandlerAufrufZeile[] }) {
  const { verstoesse, hoheFindings, nichtVerfuegbareHandler } = sammleVerstoesseUndFindings(handlerAufrufe);

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold text-ink">Compliance und Sicherheit</h2>

      <div className="mt-3 rounded-md border border-info-border bg-info-bg p-3 text-sm text-ink">
        <strong>Shadow-Mode aktiv:</strong> nichts geht automatisch raus. Jeder Entwurf wartet auf bewusste Freigabe durch eine Beraterin,
        {" "}der Versand selbst ist noch nicht angebunden.
      </div>

      {nichtVerfuegbareHandler.length > 0 && (
        <div className="mt-3 rounded-md border border-warning-border bg-warning-bg p-3 text-sm text-ink">
          Compliance-Prüfung nicht verfügbar ({nichtVerfuegbareHandler.join(", ")}).
        </div>
      )}

      {verstoesse.length === 0 && hoheFindings.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">Keine Grenz-Verstöße oder hoch eingestuften Kritiker-Findings.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {verstoesse.map((verstoss, index) => (
            <div key={`verstoss-${index}`} className="rounded-md border border-danger-border bg-danger-bg p-3 text-sm text-danger">
              <p className="font-semibold">Grenz-Verstoß ({verstoss.handlerLabel}){verstoss.baustein_name ? ` · ${verstoss.baustein_name}` : ""}</p>
              <p>{verstoss.begruendung}</p>
            </div>
          ))}
          {hoheFindings.map((finding, index) => (
            <div key={`finding-${index}`} className="rounded-md border border-danger-border bg-danger-bg p-3 text-sm text-danger">
              <p className="font-semibold">Kritiker-Finding, Schweregrad hoch ({finding.handlerLabel})</p>
              <p>{finding.finding}</p>
              <p className="mt-1 text-xs">Empfehlung: {finding.empfehlung}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
