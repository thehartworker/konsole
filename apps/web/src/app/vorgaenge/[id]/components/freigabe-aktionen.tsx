"use client";

import { useState, useTransition } from "react";
import type { AnliegenZeile, HandlerAufrufZeile, VorgangDetail } from "@/lib/vorgaenge";
import { HANDLER_LABEL } from "./labels";
import { handlerAusloesenAction, handlerFreigebenAction, rueckfrageSendenAction } from "../actions";

const AUSLOESBARE_HANDLER = new Set(["W1_pressemitteilung_drafter", "W2_presseanfragen_drafter"]);

function Meldung({ text, istFehler }: { text: string; istFehler: boolean }) {
  return (
    <p className={`mt-2 text-xs ${istFehler ? "text-danger" : "text-ink-muted"}`}>{text}</p>
  );
}

export function FreigabeAktionen({
  vorgang,
  anliegen,
  handlerAufrufe,
}: {
  vorgang: VorgangDetail;
  anliegen: AnliegenZeile[];
  handlerAufrufe: HandlerAufrufZeile[];
}) {
  const [pending, startTransition] = useTransition();
  const [meldungen, setMeldungen] = useState<Record<string, { text: string; istFehler: boolean }>>({});
  const [rueckfrageText, setRueckfrageText] = useState(vorgang.rueckfrage_nachricht ?? "");

  function handlerAufrufen(anliegenId: string) {
    startTransition(async () => {
      const resultat = await handlerAusloesenAction(vorgang.id, anliegenId);
      setMeldungen((bisherig) => ({
        ...bisherig,
        [anliegenId]:
          resultat.status === "erfolg"
            ? { text: "Entwurf erstellt. Nichts wurde versendet.", istFehler: false }
            : { text: resultat.meldung, istFehler: true },
      }));
    });
  }

  function ergebnisFreigeben(handlerAufrufId: string) {
    startTransition(async () => {
      const resultat = await handlerFreigebenAction(vorgang.id, handlerAufrufId);
      setMeldungen((bisherig) => ({
        ...bisherig,
        [handlerAufrufId]:
          resultat.status === "erfolg"
            ? { text: "Freigegeben, bereit zum Versand (Versand-Anbindung folgt).", istFehler: false }
            : { text: resultat.meldung, istFehler: true },
      }));
    });
  }

  function rueckfrageSenden() {
    startTransition(async () => {
      const resultat = await rueckfrageSendenAction(vorgang.id, rueckfrageText);
      setMeldungen((bisherig) => ({
        ...bisherig,
        rueckfrage:
          resultat.status === "erfolg"
            ? { text: "Freigegeben, bereit zum Versand (Versand-Anbindung folgt).", istFehler: false }
            : { text: resultat.meldung, istFehler: true },
      }));
    });
  }

  const auslosbareAnliegen = anliegen.filter(
    (eintrag) => eintrag.backend_handler_vorschlag && AUSLOESBARE_HANDLER.has(eintrag.backend_handler_vorschlag),
  );
  const freigebbareErgebnisse = handlerAufrufe.filter((eintrag) => eintrag.status === "done" && !eintrag.freigegeben_at);

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold text-ink">Freigabe-Aktionen</h2>

      {auslosbareAnliegen.length > 0 && (
        <div className="mt-4 space-y-3">
          {auslosbareAnliegen.map((eintrag) => {
            const bereitsAusgeloest = handlerAufrufe.some((h) => h.anliegen_id === eintrag.id);
            return (
              <div key={eintrag.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
                <div className="text-sm text-ink">
                  {eintrag.beschreibung}
                  <span className="ml-2 text-xs text-ink-muted">
                    {HANDLER_LABEL[eintrag.backend_handler_vorschlag ?? ""] ?? eintrag.backend_handler_vorschlag}
                  </span>
                </div>
                <div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handlerAufrufen(eintrag.id)}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
                  >
                    {bereitsAusgeloest ? "Handler erneut aufrufen" : "Handler aufrufen"}
                  </button>
                  {meldungen[eintrag.id] && <Meldung text={meldungen[eintrag.id].text} istFehler={meldungen[eintrag.id].istFehler} />}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {freigebbareErgebnisse.length > 0 && (
        <div className="mt-4 space-y-3">
          {freigebbareErgebnisse.map((eintrag) => (
            <div key={eintrag.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
              <span className="text-sm text-ink">{HANDLER_LABEL[eintrag.handler_slug] ?? eintrag.handler_slug} · Entwurf bereit</span>
              <div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => ergebnisFreigeben(eintrag.id)}
                  className="rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-surface-subtle disabled:opacity-50"
                >
                  Ergebnis freigeben
                </button>
                {meldungen[eintrag.id] && <Meldung text={meldungen[eintrag.id].text} istFehler={meldungen[eintrag.id].istFehler} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {vorgang.rueckfrage_nachricht !== null && (
        <div className="mt-4 rounded-md border border-border p-3">
          <h3 className="text-sm font-medium text-ink">Rückfrage an den Absender</h3>
          <textarea
            className="mt-2 w-full rounded-md border border-border p-2 text-sm text-ink"
            rows={4}
            value={rueckfrageText}
            onChange={(event) => setRueckfrageText(event.target.value)}
          />
          <button
            type="button"
            disabled={pending}
            onClick={rueckfrageSenden}
            className="mt-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            Rückfrage senden
          </button>
          {vorgang.rueckfrage_bereit_am && (
            <p className="mt-2 text-xs text-ink-muted">
              Bereits freigegeben am {new Date(vorgang.rueckfrage_bereit_am).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })} —
              Versand-Anbindung folgt.
            </p>
          )}
          {meldungen.rueckfrage && <Meldung text={meldungen.rueckfrage.text} istFehler={meldungen.rueckfrage.istFehler} />}
        </div>
      )}

      {auslosbareAnliegen.length === 0 && freigebbareErgebnisse.length === 0 && vorgang.rueckfrage_nachricht === null && (
        <p className="mt-3 text-sm text-ink-muted">Für diesen Vorgang stehen aktuell keine Freigabe-Aktionen an.</p>
      )}
    </section>
  );
}
