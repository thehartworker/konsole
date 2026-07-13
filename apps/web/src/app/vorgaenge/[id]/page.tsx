import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ladeVorgangDetail } from "@/lib/vorgaenge";
import { EingangUndKlassifikation } from "./components/eingang-und-klassifikation";
import { HandlerErgebnis } from "./components/handler-ergebnis";
import { CompliancePanel } from "./components/compliance-panel";
import { FreigabeAktionen } from "./components/freigabe-aktionen";

export default async function VorgangDetailSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const bundle = await ladeVorgangDetail(supabase, id);
  if (!bundle) {
    notFound();
  }

  const { vorgang, anliegen, handlerAufrufe, nutzerNamen } = bundle;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <EingangUndKlassifikation vorgang={vorgang} anliegen={anliegen} />
      <HandlerErgebnis handlerAufrufe={handlerAufrufe} nutzerNamen={nutzerNamen} />
      <CompliancePanel handlerAufrufe={handlerAufrufe} />
      <FreigabeAktionen vorgang={vorgang} anliegen={anliegen} handlerAufrufe={handlerAufrufe} />
    </main>
  );
}
