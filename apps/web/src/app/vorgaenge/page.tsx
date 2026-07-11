import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";

type SortSchluessel = "eingang" | "prioritaet" | "faellig";

const PRIORITAET_RANG: Record<string, number> = {
  hoch: 0,
  mittel: 1,
  niedrig: 2,
};

const PRIORITAET_LABEL: Record<string, string> = {
  hoch: "Hoch",
  mittel: "Mittel",
  niedrig: "Niedrig",
};

const STATUS_LABEL: Record<string, string> = {
  eingegangen: "Eingegangen",
  klassifiziert: "Klassifiziert",
  in_bearbeitung: "In Bearbeitung",
  abgeschlossen: "Abgeschlossen",
  abgelehnt: "Abgelehnt",
};

const KANAL_LABEL: Record<string, string> = {
  email: "E-Mail",
  whatsapp_text: "WhatsApp",
  whatsapp_audio: "WhatsApp (Audio)",
};

type VorgangZeile = {
  id: string;
  kanal: string;
  absender_identifikator: string;
  absender_name: string | null;
  eingang_at: string;
  typ_primaer: string | null;
  prioritaet: string | null;
  status: string;
  sensitivity: string;
  sla_frist_at: string | null;
  kunden: { name: string } | null;
};

function sortiere(vorgaenge: VorgangZeile[], sort: SortSchluessel): VorgangZeile[] {
  const sortiert = [...vorgaenge].sort((a, b) => {
    switch (sort) {
      case "prioritaet": {
        const rangA = a.prioritaet ? (PRIORITAET_RANG[a.prioritaet] ?? 99) : 99;
        const rangB = b.prioritaet ? (PRIORITAET_RANG[b.prioritaet] ?? 99) : 99;
        return rangA - rangB;
      }
      case "faellig": {
        if (!a.sla_frist_at) return 1;
        if (!b.sla_frist_at) return -1;
        return a.sla_frist_at.localeCompare(b.sla_frist_at);
      }
      case "eingang":
      default:
        return b.eingang_at.localeCompare(a.eingang_at);
    }
  });

  // Sensitive Vorgänge stehen immer oben, unabhängig von der Sortierung (§6.1).
  sortiert.sort((a, b) => {
    const sensitivA = a.sensitivity !== "normal" ? 0 : 1;
    const sensitivB = b.sensitivity !== "normal" ? 0 : 1;
    return sensitivA - sensitivB;
  });

  return sortiert;
}

export default async function VorgangsListe({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: sortParam } = await searchParams;
  const sort: SortSchluessel =
    sortParam === "prioritaet" || sortParam === "faellig" ? sortParam : "eingang";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // RLS-geschützte Query: current_agentur_id()/current_rolle() (siehe
  // docs/decisions/2026-07-10_rls-policies.md) filtern serverseitig, sodass
  // jeder Nutzer nur sieht, was seine Rolle erlaubt (Mandanten-, Kunden- und
  // Sensitivity-Grenze).
  const { data, error } = await supabase
    .from("vorgaenge")
    .select(
      "id, kanal, absender_identifikator, absender_name, eingang_at, typ_primaer, prioritaet, status, sensitivity, sla_frist_at, kunden(name)",
    );

  const vorgaenge = sortiere((data ?? []) as unknown as VorgangZeile[], sort);

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold text-slate-900">Vorgänge</h1>
          <nav className="flex gap-3 text-sm text-slate-500">
            <span>Sortieren nach:</span>
            <Link
              href="/vorgaenge?sort=eingang"
              className={sort === "eingang" ? "font-medium text-slate-900" : "hover:text-slate-900"}
            >
              Eingang
            </Link>
            <Link
              href="/vorgaenge?sort=prioritaet"
              className={sort === "prioritaet" ? "font-medium text-slate-900" : "hover:text-slate-900"}
            >
              Priorität
            </Link>
            <Link
              href="/vorgaenge?sort=faellig"
              className={sort === "faellig" ? "font-medium text-slate-900" : "hover:text-slate-900"}
            >
              Fälligkeit
            </Link>
          </nav>
        </div>

        {error ? (
          <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Vorgänge konnten nicht geladen werden.
          </p>
        ) : null}

        {!error && vorgaenge.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">Keine Vorgänge sichtbar.</p>
        ) : null}

        {vorgaenge.length > 0 ? (
          <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {vorgaenge.map((vorgang) => {
              const sensitiv = vorgang.sensitivity !== "normal";
              return (
                <li
                  key={vorgang.id}
                  className={`px-4 py-3 ${sensitiv ? "border-l-4 border-red-500 bg-red-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-medium ${sensitiv ? "text-red-800" : "text-slate-900"}`}>
                        {vorgang.kunden?.name ?? "Unbekannter Kunde"}
                        {sensitiv ? " · sensitiv" : ""}
                      </p>
                      <p className="truncate text-sm text-slate-500">
                        {vorgang.absender_name ?? vorgang.absender_identifikator} ·{" "}
                        {KANAL_LABEL[vorgang.kanal] ?? vorgang.kanal}
                        {vorgang.typ_primaer ? ` · ${vorgang.typ_primaer}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-sm text-slate-600">
                      <span>
                        {vorgang.prioritaet ? (PRIORITAET_LABEL[vorgang.prioritaet] ?? vorgang.prioritaet) : "—"}
                      </span>
                      <span>{STATUS_LABEL[vorgang.status] ?? vorgang.status}</span>
                      <time dateTime={vorgang.eingang_at} className="tabular-nums text-slate-400">
                        {new Date(vorgang.eingang_at).toLocaleString("de-DE", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </main>
    </div>
  );
}
