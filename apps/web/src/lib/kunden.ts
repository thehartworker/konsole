// Lade-Funktionen für /kunden und /kunden/[id] (Issue #50, Aufgabe A).
// Laufen ausschließlich über den Session-Client -- RLS ist die einzige
// Durchsetzungsinstanz (AGENTS.md §4), gleiches Prinzip wie src/lib/vorgaenge.ts.
// "Sitz" ist kein Feld der kunden-Tabelle selbst, sondern Teil des
// Kundenprofils (kunden_profil.sitz, Sektion "Fakten") -- deshalb zwei
// getrennte Abfragen statt eines PostgREST-Embeds (Embed-Richtung bei einer
// 1:1-Beziehung ist ohne laufende Datenbank nicht sicher verifizierbar,
// zwei Abfragen + Merge in JS sind hier robuster, gleiches Muster wie
// ladeVorgangDetail/nutzerNamen in vorgaenge.ts).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface KundenListenEintrag {
  id: string;
  name: string;
  slug: string;
  sitz: string | null;
}

export async function ladeKundenListe(supabase: SupabaseClient): Promise<KundenListenEintrag[]> {
  const { data: kundenRaw, error } = await supabase
    .from("kunden")
    .select("id, name, slug")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`ladeKundenListe: ${error.message}`);
  }

  const kunden = kundenRaw ?? [];
  if (kunden.length === 0) return [];

  const { data: profileRaw, error: profilFehler } = await supabase
    .from("kunden_profil")
    .select("kunde_id, sitz")
    .in(
      "kunde_id",
      kunden.map((eintrag) => eintrag.id),
    )
    .is("deleted_at", null);

  if (profilFehler) {
    throw new Error(`ladeKundenListe(profile): ${profilFehler.message}`);
  }

  const sitzProKunde = new Map((profileRaw ?? []).map((eintrag) => [eintrag.kunde_id as string, eintrag.sitz as string | null]));

  return kunden.map((eintrag) => ({
    id: eintrag.id,
    name: eintrag.name,
    slug: eintrag.slug,
    sitz: sitzProKunde.get(eintrag.id) ?? null,
  }));
}

export interface KundeStammdaten {
  id: string;
  name: string;
  slug: string;
}

export async function ladeKunde(supabase: SupabaseClient, kundeId: string): Promise<KundeStammdaten | null> {
  const { data, error } = await supabase.from("kunden").select("id, name, slug").eq("id", kundeId).is("deleted_at", null).maybeSingle();

  if (error) {
    throw new Error(`ladeKunde: ${error.message}`);
  }

  return (data as KundeStammdaten | null) ?? null;
}
