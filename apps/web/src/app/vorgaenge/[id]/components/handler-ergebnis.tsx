import type { W1Output, W2Output } from "@konsole/handlers";
import { W1_HANDLER_SLUG, W2_HANDLER_SLUG } from "@konsole/handlers";
import type { HandlerAufrufZeile } from "@/lib/vorgaenge";
import { HANDLER_LABEL } from "./labels";
import { PressemitteilungEditor } from "./pressemitteilung-editor";
import { CommsPlanAnsicht } from "./comms-plan-ansicht";

const STATUS_LABEL: Record<string, string> = {
  queued: "Eingereiht",
  in_progress: "Läuft",
  done: "Entwurf erstellt",
  failed: "Fehlgeschlagen",
  escalated: "Eskaliert",
};

export function HandlerErgebnis({
  handlerAufrufe,
  nutzerNamen,
}: {
  handlerAufrufe: HandlerAufrufZeile[];
  nutzerNamen: Record<string, string>;
}) {
  if (handlerAufrufe.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold text-ink">Handler-Ergebnis</h2>
      <div className="mt-4 space-y-6">
        {handlerAufrufe.map((eintrag) => (
          <article key={eintrag.id} className="rounded-md border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-ink">{HANDLER_LABEL[eintrag.handler_slug] ?? eintrag.handler_slug}</h3>
              <span className="rounded-full border border-border bg-surface-subtle px-2 py-0.5 text-xs text-ink-muted">
                {STATUS_LABEL[eintrag.status] ?? eintrag.status}
              </span>
            </div>

            {eintrag.status === "failed" && eintrag.fehler && (
              <p className="mt-3 rounded-md border border-danger-border bg-danger-bg p-3 text-sm text-danger">
                Handler-Lauf fehlgeschlagen: {eintrag.fehler}
              </p>
            )}

            {eintrag.status === "done" && eintrag.ergebnis && (
              <div className="mt-4">
                {eintrag.handler_slug === W1_HANDLER_SLUG && (
                  <PressemitteilungEditor
                    handlerAufrufId={eintrag.id}
                    initial={(eintrag.ergebnis_bearbeitet ?? eintrag.ergebnis) as unknown as W1Output}
                    wurdeBereitsBearbeitet={eintrag.ergebnis_bearbeitet !== null}
                    warFreigegeben={eintrag.freigegeben_at !== null}
                  />
                )}
                {eintrag.handler_slug === W2_HANDLER_SLUG && (
                  <CommsPlanAnsicht output={eintrag.ergebnis as unknown as W2Output} />
                )}
              </div>
            )}

            <p className="mt-4 text-xs text-ink-muted">
              {eintrag.freigegeben_at ? (
                <>
                  Zum Versand freigegeben am {new Date(eintrag.freigegeben_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}
                  {eintrag.freigegeben_durch ? ` durch ${nutzerNamen[eintrag.freigegeben_durch] ?? eintrag.freigegeben_durch}` : ""}
                  {" — Versand-Anbindung folgt (kein automatischer Versand in v1)."}
                </>
              ) : (
                "Noch nicht freigegeben."
              )}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
