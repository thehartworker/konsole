import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ladeKunde } from "@/lib/kunden";

// Kunden-Detail-Container (Issue #50, Aufgabe A): in v1 nur der Sub-Tab
// "Profil". Vorgangs-Historie/Kontakte/etc. sind vorbereitet (Tab-Leiste
// unten ist so gebaut, dass ein weiterer Eintrag nur eine weitere Zeile
// braucht), aber bewusst NICHT gebaut (Scope-Grenze aus dem Issue).
export default async function KundeDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const kunde = await ladeKunde(supabase, id);
  if (!kunde) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-lg font-semibold text-ink">{kunde.name}</h1>

      <nav aria-label="Kunden-Bereiche" className="mt-4 flex gap-4 border-b border-border text-sm">
        <span className="border-b-2 border-primary px-1 pb-2 font-medium text-ink" aria-current="page">
          Profil
        </span>
      </nav>

      <div className="mt-6">{children}</div>
    </main>
  );
}
