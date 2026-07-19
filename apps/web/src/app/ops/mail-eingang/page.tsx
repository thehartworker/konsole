import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// /ops/mail-eingang -- Ops-Sicht auf mail_eingang_log (Issue #52, Aufgabe D),
// nur für die chef-Rolle. RLS (mail_eingang_log_lesen) würde
// manager/editor bereits auf die eigenen zugewiesenen Kunden einschränken,
// diese Route blendet die Sicht für sie zusätzlich komplett aus -- das ist
// die Ops-Gesamtsicht über alle Kunden der Agentur, nicht die
// Einzelkunden-Ansicht (die liegt unter /kunden/[id]/mail-anbindung).

const STATUS_LABEL: Record<string, string> = {
  angenommen: "Angenommen",
  duplikat: "Duplikat",
  kein_kunde_zugeordnet: "Kein Kunde zugeordnet",
  fehler: "Fehler",
};

interface MailEingangLogZeile {
  id: string;
  message_id: string;
  empfangen_at: string;
  verarbeitungs_status: string;
  fehler_meldung: string | null;
  kunden_mail_anbindungen: { kunde_id: string; kunden: { name: string } | null } | null;
}

export default async function OpsMailEingangSeite({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: nutzer } = await supabase.from("nutzer").select("rolle").eq("id", user.id).single();

  if (nutzer?.rolle !== "chef") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-sm text-red-700">Diese Ansicht ist nur für die Chef-Rolle verfügbar.</p>
      </main>
    );
  }

  let query = supabase
    .from("mail_eingang_log")
    .select("id, message_id, empfangen_at, verarbeitungs_status, fehler_meldung, kunden_mail_anbindungen(kunde_id, kunden(name))")
    .order("empfangen_at", { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq("verarbeitungs_status", status);
  }

  const { data, error } = await query;
  const eintraege = (data ?? []) as unknown as MailEingangLogZeile[];

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-lg font-semibold text-ink">Mail-Eingang (Ops-Sicht)</h1>
      <p className="mt-1 text-sm text-ink-muted">Letzte 100 Einträge aus mail_eingang_log, insbesondere "Kein Kunde zugeordnet" deutet auf Konfigurations-Probleme hin.</p>

      <div className="mt-4 flex gap-2 text-sm">
        <a href="/ops/mail-eingang" className={!status ? "font-semibold text-ink" : "text-ink-muted"}>
          Alle
        </a>
        {Object.entries(STATUS_LABEL).map(([wert, label]) => (
          <a key={wert} href={`/ops/mail-eingang?status=${wert}`} className={status === wert ? "font-semibold text-ink" : "text-ink-muted"}>
            {label}
          </a>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-red-700">Fehler beim Laden: {error.message}</p>}

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-ink-muted">
            <th className="py-2">Empfangen</th>
            <th className="py-2">Kunde</th>
            <th className="py-2">Status</th>
            <th className="py-2">Message-ID</th>
            <th className="py-2">Fehler</th>
          </tr>
        </thead>
        <tbody>
          {eintraege.map((eintrag) => (
            <tr key={eintrag.id} className="border-b border-border">
              <td className="py-2">{new Date(eintrag.empfangen_at).toLocaleString("de-DE")}</td>
              <td className="py-2">{eintrag.kunden_mail_anbindungen?.kunden?.name ?? "–"}</td>
              <td className="py-2">{STATUS_LABEL[eintrag.verarbeitungs_status] ?? eintrag.verarbeitungs_status}</td>
              <td className="py-2 font-mono text-xs">{eintrag.message_id}</td>
              <td className="py-2 text-xs text-red-700">{eintrag.fehler_meldung ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {eintraege.length === 0 && !error && <p className="mt-4 text-sm text-ink-muted">Keine Einträge.</p>}
    </main>
  );
}
