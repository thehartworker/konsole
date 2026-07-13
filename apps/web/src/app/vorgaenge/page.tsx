import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ladeVorgaengeListe } from "@/lib/vorgaenge";
import { PRIORITAET_LABEL, SENSITIVITY_LABEL, istSensitiverVorgang } from "./[id]/components/labels";

// Schlanke Vorgangs-Liste (Issue #43): existierte im Repo noch nicht, ist
// aber Voraussetzung, damit /vorgaenge/[id] erreichbar ist. Die volle
// Drei-Spalten-Übersicht aus SAAS_SPEC §6.1 (Aktivitäts-Spalte, Session-/
// Team-Log) ist bewusst NICHT Teil dieses Blocks, siehe
// docs/decisions/2026-07-13_konsole-block1-vorgangs-detailansicht.md,
// Abschnitt 1.

export default async function VorgaengeListeSeite() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const vorgaenge = await ladeVorgaengeListe(supabase);
  // Sensitive Vorgänge stehen oben (SAAS_SPEC §6.1).
  const sortiert = [...vorgaenge].sort((a, b) => {
    const aSensitiv = istSensitiverVorgang(a.sensitivity) ? 1 : 0;
    const bSensitiv = istSensitiverVorgang(b.sensitivity) ? 1 : 0;
    return bSensitiv - aSensitiv;
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-lg font-semibold text-ink">Vorgänge</h1>

      {sortiert.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">Keine Vorgänge sichtbar.</p>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
          {sortiert.map((vorgang) => {
            const sensitiv = istSensitiverVorgang(vorgang.sensitivity);
            return (
              <li key={vorgang.id}>
                <Link
                  href={`/vorgaenge/${vorgang.id}`}
                  className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-surface-subtle ${
                    sensitiv ? "border-l-4 border-danger bg-danger-bg/40" : ""
                  }`}
                >
                  <span className="font-medium text-ink">
                    {vorgang.kunde_name} · {vorgang.absender_name ?? vorgang.absender_identifikator}
                  </span>
                  <span className="text-ink-muted">{vorgang.betreff ?? vorgang.typ_primaer ?? "Ohne Betreff"}</span>
                  <span className={`text-xs ${sensitiv ? "font-semibold text-danger" : "text-ink-muted"}`}>
                    {SENSITIVITY_LABEL[vorgang.sensitivity] ?? vorgang.sensitivity}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {vorgang.prioritaet ? PRIORITAET_LABEL[vorgang.prioritaet] : "—"}
                  </span>
                  <span className="text-xs text-ink-muted">{new Date(vorgang.eingang_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
