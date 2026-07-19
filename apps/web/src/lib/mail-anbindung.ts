// Lade-Funktionen für /kunden/[id]/mail-anbindung (Issue #52, Aufgabe D).
// Laufen über den Session-Client -- RLS ist die Durchsetzungsinstanz
// (AGENTS.md §4), gleiches Prinzip wie src/lib/kunden.ts.

import type { SupabaseClient } from "@supabase/supabase-js";

export type MailAnbindungsTyp = "weiterleitung" | "imap_kundenpostfach";

export interface MailAnbindung {
  id: string;
  anbindungsTyp: MailAnbindungsTyp;
  konsolenAdresse: string | null;
  imapHost: string | null;
  imapBenutzername: string | null;
  aktiv: boolean;
  angelegtAt: string;
  letzterMailEmpfangAt: string | null;
}

interface MailAnbindungZeile {
  id: string;
  anbindungs_typ: MailAnbindungsTyp;
  konsolen_adresse: string | null;
  imap_host: string | null;
  imap_benutzername: string | null;
  aktiv: boolean;
  angelegt_at: string;
}

export async function ladeMailAnbindung(supabase: SupabaseClient, kundeId: string): Promise<MailAnbindung | null> {
  const { data, error } = await supabase
    .from("kunden_mail_anbindungen")
    .select("id, anbindungs_typ, konsolen_adresse, imap_host, imap_benutzername, aktiv, angelegt_at")
    .eq("kunde_id", kundeId)
    .is("deleted_at", null)
    .order("angelegt_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`ladeMailAnbindung: ${error.message}`);
  }
  if (!data) return null;

  const zeile = data as MailAnbindungZeile;

  const { data: letzterEmpfang } = await supabase
    .from("mail_eingang_log")
    .select("empfangen_at")
    .eq("kunden_mail_anbindung_id", zeile.id)
    .order("empfangen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    id: zeile.id,
    anbindungsTyp: zeile.anbindungs_typ,
    konsolenAdresse: zeile.konsolen_adresse,
    imapHost: zeile.imap_host,
    imapBenutzername: zeile.imap_benutzername,
    aktiv: zeile.aktiv,
    angelegtAt: zeile.angelegt_at,
    letzterMailEmpfangAt: (letzterEmpfang as { empfangen_at: string } | null)?.empfangen_at ?? null,
  };
}

/** Die eigene Agentur ist über RLS (agentur_lesen) immer genau eine Zeile. */
export async function ladeEigeneAgenturSlug(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.from("agenturen").select("slug").maybeSingle();
  if (error) {
    throw new Error(`ladeEigeneAgenturSlug: ${error.message}`);
  }
  return (data as { slug: string } | null)?.slug ?? null;
}
