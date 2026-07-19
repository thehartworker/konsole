import { redirect } from "next/navigation";
import { SupabaseKundenProfilRepository } from "@konsole/persistence";
import { createClient } from "@/lib/supabase/server";
import { ProfilEditor } from "./components/profil-editor";

// /kunden/[id]/profil -- der Kundenprofil-Editor (Issue #50, Aufgabe B).
// Kunden-Existenz/Berechtigung wird bereits im umgebenden Layout geprüft
// (kunden/[id]/layout.tsx), hier nur noch das Profil selbst laden.
export default async function KundenProfilSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profil = await new SupabaseKundenProfilRepository(supabase).profilLaden(id);

  return <ProfilEditor kundeId={id} initialProfil={profil} />;
}
