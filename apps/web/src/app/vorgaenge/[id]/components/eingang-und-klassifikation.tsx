import type { AnliegenZeile, VorgangDetail } from "@/lib/vorgaenge";
import { HANDLER_LABEL, KANAL_LABEL, PRIORITAET_LABEL, SENSITIVITY_LABEL, konfidenzKategorie, istSensitiverVorgang } from "./labels";

function formatiereZeitpunkt(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

export function EingangUndKlassifikation({
  vorgang,
  anliegen,
}: {
  vorgang: VorgangDetail;
  anliegen: AnliegenZeile[];
}) {
  const sensitivBadge = istSensitiverVorgang(vorgang.sensitivity);

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">{vorgang.betreff ?? "Ohne Betreff"}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {KANAL_LABEL[vorgang.kanal] ?? vorgang.kanal} · {vorgang.absender_name ?? vorgang.absender_identifikator}
            {vorgang.absender_rolle ? ` (${vorgang.absender_rolle})` : ""} · {formatiereZeitpunkt(vorgang.eingang_at)}
          </p>
          <p className="text-sm text-ink-muted">Kunde: {vorgang.kunde_name}</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            sensitivBadge ? "border-danger-border bg-danger-bg text-danger" : "border-border bg-surface-subtle text-ink-muted"
          }`}
        >
          {SENSITIVITY_LABEL[vorgang.sensitivity] ?? vorgang.sensitivity}
        </span>
      </div>

      <blockquote className="mt-4 border-l-4 border-border bg-surface-subtle p-4 text-sm text-ink whitespace-pre-wrap">
        {vorgang.inhalt_text}
      </blockquote>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-ink-muted">Typ</dt>
          <dd className="font-medium text-ink">
            {vorgang.typ_primaer ?? "—"}
            {vorgang.typ_sekundaer ? ` / ${vorgang.typ_sekundaer}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Priorität</dt>
          <dd className="font-medium text-ink">{vorgang.prioritaet ? PRIORITAET_LABEL[vorgang.prioritaet] : "—"}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Einschätzung</dt>
          <dd className="font-medium text-ink">{konfidenzKategorie(vorgang.confidence)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Sprache</dt>
          <dd className="font-medium text-ink">{vorgang.sprache_ausgang ?? "—"}</dd>
        </div>
      </dl>

      {anliegen.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-ink">Anliegen</h2>
          <ul className="mt-2 space-y-2">
            {anliegen.map((eintrag) => (
              <li key={eintrag.id} className="rounded-md border border-border p-3 text-sm">
                <p className="text-ink">{eintrag.beschreibung}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Priorität: {PRIORITAET_LABEL[eintrag.prioritaet] ?? eintrag.prioritaet}
                  {eintrag.frist_annahme ? ` · Frist: ${eintrag.frist_annahme}` : ""}
                  {eintrag.backend_handler_vorschlag
                    ? ` · Handler-Vorschlag: ${HANDLER_LABEL[eintrag.backend_handler_vorschlag] ?? eintrag.backend_handler_vorschlag}`
                    : " · kein Handler-Vorschlag"}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
