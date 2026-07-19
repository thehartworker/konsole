import { redirect } from "next/navigation";
import { ladeMailAnbindung } from "@/lib/mail-anbindung";
import { createClient } from "@/lib/supabase/server";
import { MailAnbindungEditor } from "./components/mail-anbindung-editor";

// /kunden/[id]/mail-anbindung -- Mail-Anbindungs-Konfiguration (Issue #52,
// Aufgabe D). Kunden-Existenz/Berechtigung wird bereits im umgebenden
// Layout geprüft (kunden/[id]/layout.tsx), hier nur noch die Anbindung selbst laden.
export default async function MailAnbindungSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const anbindung = await ladeMailAnbindung(supabase, id);

  return <MailAnbindungEditor kundeId={id} initialAnbindung={anbindung} />;
}
