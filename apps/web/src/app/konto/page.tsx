import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ROLLEN_LABEL: Record<string, string> = {
  chef: "Chef",
  manager: "Etatdirektor:in",
  editor: "Berater:in",
  reader: "Assistenz",
  guest: "Extern (Gast)",
};

export default async function KontoSeite() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // RLS-geschuetzte Query: current_agentur_id()/current_rolle() (siehe
  // docs/decisions/2026-07-10_rls-policies.md) lesen aus derselben
  // nutzer-Zeile, die hier abgefragt wird. Zeigt die Zeile korrekt Name,
  // Rolle und Agentur, greifen RLS-Policies fuer diese Session wie erwartet.
  const { data: nutzer } = await supabase
    .from("nutzer")
    .select("name, rolle, agenturen(name)")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-xl font-semibold text-slate-900">Angemeldet</h1>

      {nutzer ? (
        <p className="mt-4 text-sm text-slate-700">
          Eingeloggt als <strong>{nutzer.name}</strong> (
          {ROLLEN_LABEL[nutzer.rolle] ?? nutzer.rolle}) bei{" "}
          <strong>{nutzer.agenturen?.name ?? "unbekannte Agentur"}</strong>.
        </p>
      ) : (
        <p className="mt-4 text-sm text-red-700">
          Kein passender nutzer-Datensatz gefunden (RLS blockiert den Zugriff
          oder die Nutzer-Verknuepfung fehlt).
        </p>
      )}

      <form action="/logout" method="post" className="mt-8">
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Abmelden
        </button>
      </form>
    </main>
  );
}
