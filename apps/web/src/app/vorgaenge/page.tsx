import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";

const KANAL_LABEL: Record<string, string> = {
  email: "E-Mail",
  whatsapp_text: "WhatsApp (Text)",
  whatsapp_audio: "WhatsApp (Audio)",
  dateiablage: "Dateiablage",
  manuell: "Manuell",
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
  uebernommen: "Übernommen",
  abgeschlossen: "Abgeschlossen",
  abgelehnt: "Abgelehnt",
};

const SORTIERUNGEN = {
  eingang: { spalte: "eingang_at", aufsteigend: false, label: "Eingang" },
  prioritaet: { spalte: "prioritaet", aufsteigend: true, label: "Priorität" },
  faelligkeit: { spalte: "sla_frist_at", aufsteigend: true, label: "Fälligkeit" },
} as const;

type SortSchluessel = keyof typeof SORTIERUNGEN;

function istSortSchluessel(wert: string | undefined): wert is SortSchluessel {
  return wert !== undefined && wert in SORTIERUNGEN;
}

export default async function VorgaengeSeite({
  searchParams,
}: {
  searchParams: Promise<{ sortierung?: string }>;
}) {
  const { sortierung: sortierungParam } = await searchParams;
  const sortSchluessel: SortSchluessel = istSortSchluessel(sortierungParam) ? sortierungParam : "eingang";
  const sortierung = SORTIERUNGEN[sortSchluessel];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // RLS-geschuetzte Query: die vorgaenge-Policy (siehe
  // docs/decisions/2026-07-10_rls-policies.md) filtert ueber
  // darf_vorgang_sehen() auf current_agentur_id()/current_rolle() dieser
  // Session. Jeder Nutzer sieht hier ausschliesslich, was er sehen darf.
  const { data: vorgaenge, error } = await supabase
    .from("vorgaenge")
    .select(
      "id, kanal, absender_identifikator, absender_name, eingang_at, sensitivity, typ_primaer, prioritaet, status, sla_frist_at, kunden(name)",
    )
    .order(sortierung.spalte, { ascending: sortierung.aufsteigend, nullsFirst: false });

  const sensitiveOben = [...(vorgaenge ?? [])].sort((a, b) => {
    const aSensitiv = a.sensitivity !== "normal";
    const bSensitiv = b.sensitivity !== "normal";
    if (aSensitiv === bSensitiv) return 0;
    return aSensitiv ? -1 : 1;
  });

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900">Vorgänge</h1>
          <div className="flex gap-3 text-sm text-slate-500">
            {(Object.keys(SORTIERUNGEN) as SortSchluessel[]).map((schluessel) => (
              <Link
                key={schluessel}
                href={`/vorgaenge?sortierung=${schluessel}`}
                className={schluessel === sortSchluessel ? "font-medium text-slate-900" : "hover:text-slate-700"}
              >
                {SORTIERUNGEN[schluessel].label}
              </Link>
            ))}
          </div>
        </div>

        {error ? (
          <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Vorgänge konnten nicht geladen werden.
          </p>
        ) : null}

        {!error && sensitiveOben.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">Keine Vorgänge sichtbar.</p>
        ) : null}

        {sensitiveOben.length > 0 ? (
          <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {sensitiveOben.map((vorgang) => {
              const sensitiv = vorgang.sensitivity !== "normal";
              return (
                <li
                  key={vorgang.id}
                  className={`px-4 py-3 ${sensitiv ? "bg-red-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {vorgang.kunden?.name ?? "Unbekannter Kunde"}
                        {" · "}
                        {vorgang.absender_name ?? vorgang.absender_identifikator}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {KANAL_LABEL[vorgang.kanal] ?? vorgang.kanal}
                        {" · "}
                        {new Date(vorgang.eingang_at).toLocaleString("de-DE")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs">
                      {sensitiv ? (
                        <span className="rounded-full bg-red-100 px-2 py-1 font-medium text-red-800">
                          Sensitiv
                        </span>
                      ) : null}
                      {vorgang.typ_primaer ? (
                        <span className="text-slate-600">{vorgang.typ_primaer}</span>
                      ) : (
                        <span className="text-slate-400">Nicht klassifiziert</span>
                      )}
                      {vorgang.prioritaet ? (
                        <span className="text-slate-600">{PRIORITAET_LABEL[vorgang.prioritaet] ?? vorgang.prioritaet}</span>
                      ) : null}
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                        {STATUS_LABEL[vorgang.status] ?? vorgang.status}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </main>
    </>
  );
}
