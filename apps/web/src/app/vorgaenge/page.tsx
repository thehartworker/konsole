import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";

type Vorgang = {
  id: string;
  kanal: string;
  absender_identifikator: string;
  absender_name: string | null;
  eingang_at: string;
  betreff: string | null;
  sensitivity: string;
  typ_primaer: string | null;
  prioritaet: string | null;
  sla_frist_at: string | null;
  status: string;
  kunden: { name: string } | null;
};

const SORT_OPTIONEN = ["eingang", "prioritaet", "faelligkeit"] as const;
type SortOption = (typeof SORT_OPTIONEN)[number];

const SORT_LABEL: Record<SortOption, string> = {
  eingang: "Eingang",
  prioritaet: "Priorität",
  faelligkeit: "Fälligkeit",
};

const PRIORITAET_RANG: Record<string, number> = {
  hoch: 0,
  mittel: 1,
  niedrig: 2,
};

const STATUS_LABEL: Record<string, string> = {
  eingegangen: "Eingegangen",
  klassifiziert: "Klassifiziert",
  in_bearbeitung: "In Bearbeitung",
  uebernommen: "Übernommen",
  abgeschlossen: "Abgeschlossen",
  abgelehnt: "Abgelehnt",
};

function istSensitiv(v: Vorgang) {
  return v.sensitivity !== "normal";
}

function sortiere(vorgaenge: Vorgang[], sort: SortOption): Vorgang[] {
  const kopie = [...vorgaenge];
  switch (sort) {
    case "prioritaet":
      return kopie.sort(
        (a, b) =>
          (PRIORITAET_RANG[a.prioritaet ?? ""] ?? 99) -
          (PRIORITAET_RANG[b.prioritaet ?? ""] ?? 99),
      );
    case "faelligkeit":
      return kopie.sort((a, b) => {
        if (!a.sla_frist_at) return 1;
        if (!b.sla_frist_at) return -1;
        return a.sla_frist_at.localeCompare(b.sla_frist_at);
      });
    case "eingang":
    default:
      return kopie.sort((a, b) => b.eingang_at.localeCompare(a.eingang_at));
  }
}

function formatiereZeitpunkt(iso: string) {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function VorgaengeSeite({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: sortParam } = await searchParams;
  const sort: SortOption = SORT_OPTIONEN.includes(sortParam as SortOption)
    ? (sortParam as SortOption)
    : "eingang";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // RLS-geschuetzte Query: current_agentur_id()/current_rolle() (siehe
  // docs/decisions/2026-07-10_rls-policies.md) filtern serverseitig, sodass
  // hier ausschliesslich Vorgaenge ankommen, die dieser Nutzer sehen darf.
  const { data, error } = await supabase
    .from("vorgaenge")
    .select(
      "id, kanal, absender_identifikator, absender_name, eingang_at, betreff, sensitivity, typ_primaer, prioritaet, sla_frist_at, status, kunden(name)",
    )
    .is("deleted_at", null);

  const vorgaenge = (data ?? []) as unknown as Vorgang[];
  const sensitiv = sortiere(vorgaenge.filter(istSensitiv), sort);
  const normal = sortiere(vorgaenge.filter((v) => !istSensitiv(v)), sort);

  return (
    <>
      <Nav aktiv="vorgaenge" />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900">Vorgänge</h1>
          <div className="flex items-center gap-1 text-sm text-slate-500">
            <span>Sortiert nach:</span>
            {SORT_OPTIONEN.map((option) => (
              <Link
                key={option}
                href={`/vorgaenge?sort=${option}`}
                className={`rounded-md px-2 py-1 ${
                  sort === option
                    ? "bg-slate-900 text-white"
                    : "hover:bg-slate-100"
                }`}
              >
                {SORT_LABEL[option]}
              </Link>
            ))}
          </div>
        </div>

        {error ? (
          <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Vorgänge konnten nicht geladen werden: {error.message}
          </p>
        ) : vorgaenge.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">
            Keine Vorgänge sichtbar. Entweder liegen noch keine vor, oder es
            gibt aktuell keine, die für diese Rolle freigegeben sind.
          </p>
        ) : (
          <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {[...sensitiv, ...normal].map((v) => (
              <li
                key={v.id}
                className={`px-4 py-3 ${
                  istSensitiv(v) ? "border-l-4 border-red-500 bg-red-50" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {v.kunden?.name ?? "Unbekannter Kunde"} —{" "}
                      {v.betreff ?? v.absender_name ?? v.absender_identifikator}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {v.absender_name ?? v.absender_identifikator} ·{" "}
                      {v.typ_primaer ?? "Noch nicht klassifiziert"} ·{" "}
                      {formatiereZeitpunkt(v.eingang_at)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    {istSensitiv(v) ? (
                      <span className="rounded-full bg-red-600 px-2 py-0.5 font-medium text-white">
                        {v.sensitivity}
                      </span>
                    ) : null}
                    {v.prioritaet ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                        {v.prioritaet}
                      </span>
                    ) : null}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                      {STATUS_LABEL[v.status] ?? v.status}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
