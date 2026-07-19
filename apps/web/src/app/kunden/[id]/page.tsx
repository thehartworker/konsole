import { redirect } from "next/navigation";

// /kunden/[id] leitet auf den einzigen v1-Sub-Tab weiter (Issue #50, Aufgabe A).
export default async function KundeDetailSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/kunden/${id}/profil`);
}
