import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ladeKunde } from "@/lib/kunden";
import { KundenNav } from "./components/kunden-nav";

// Kunden-Detail-Container (Issue #50, Aufgabe A; Issue #52, Aufgabe D fügt
// den "Mail-Anbindung"-Tab hinzu). Vorgangs-Historie/Kontakte/etc. sind
// vorbereitet (KundenNav ist so gebaut, dass ein weiterer Eintrag nur eine
// weitere Zeile braucht), aber bewusst NICHT gebaut (Scope-Grenze).
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

      <KundenNav kundeId={id} />

      <div className="mt-6">{children}</div>
    </main>
  );
}
