import type { W2Output } from "@konsole/handlers";

// Rendert den Comms-Plan (die sechs Felder aus WORKFLOW_HANDLERS_v1.0.md W2)
// in Struktur-Segmente zerlegt, analog PressemitteilungAnsicht. Siehe
// docs/decisions/2026-07-13_konsole-block1-vorgangs-detailansicht.md,
// Abschnitt 7.

export function CommsPlanAnsicht({ output }: { output: W2Output }) {
  const { comms_plan } = output;

  return (
    <div className="space-y-4">
      <div data-segment="what_were_doing">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Was wir tun</h3>
        <p className="text-sm text-ink">{comms_plan.what_were_doing}</p>
      </div>

      <div data-segment="strategic_objectives" className="grid gap-3 sm:grid-cols-2">
        <div data-segment="strategic_objectives.reputation">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Reputationsziel</h3>
          <p className="text-sm text-ink">{comms_plan.strategic_objectives.reputation}</p>
        </div>
        <div data-segment="strategic_objectives.risk">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Risiko</h3>
          <p className="text-sm text-ink">{comms_plan.strategic_objectives.risk}</p>
        </div>
      </div>

      {comms_plan.reactive_statement && (
        <div data-segment="reactive_statement">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Reaktives Statement</h3>
          <p className="text-sm text-ink">{comms_plan.reactive_statement}</p>
        </div>
      )}

      {comms_plan.background_information.length > 0 && (
        <div data-segment="background_information">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Hintergrund-Informationen</h3>
          <ul className="mt-1 space-y-2">
            {comms_plan.background_information.map((eintrag, index) => (
              <li key={index} data-segment={`background_information.${index}`} className="rounded-md border border-border p-2 text-sm">
                <p className="font-medium text-ink">{eintrag.topic_field}</p>
                <p className="text-ink">{eintrag.content}</p>
                <p className="mt-1 text-xs text-ink-muted">Quellen: {eintrag.sources.join(", ") || "—"}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {comms_plan.open_questions.length > 0 && (
        <div data-segment="open_questions">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Offene Fragen</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
            {comms_plan.open_questions.map((frage, index) => (
              <li key={index} data-segment={`open_questions.${index}`}>
                {frage}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div data-segment="key_messages">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Kernbotschaften</h3>
        <p className="text-sm text-ink-muted">In v1 pausiert (WORKFLOW_HANDLERS_v1.0.md W2).</p>
      </div>
    </div>
  );
}
