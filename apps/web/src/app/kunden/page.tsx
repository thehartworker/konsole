import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ladeKundenListe } from "@/lib/kunden";

// /kunden -- Liste aller Kunden, denen die Beraterin zugewiesen ist (Issue
// #50, Aufgabe A). Der Chef sieht alle Kunden der Agentur, RLS greift
// automatisch (kunden_lesen-Policy, siehe
// supabase/migrations/20260711130200_helper_funktionen_und_rls.sql). Kein
// Suchfeld in v1 (Scope-Grenze aus dem Issue).
export default async function KundenListeSeite() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const kunden = await ladeKundenListe(supabase);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-lg font-semibold text-ink">Kunden</h1>

      {kunden.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">Keine Kunden sichtbar.</p>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
          {kunden.map((kunde) => (
            <li key={kunde.id}>
              <Link
                href={`/kunden/${kunde.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-surface-subtle"
              >
                <span className="font-medium text-ink">{kunde.name}</span>
                <span className="text-ink-muted">{kunde.sitz ?? "Sitz noch nicht erfasst"}</span>
                <span className="text-xs text-primary underline">Profil öffnen</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
