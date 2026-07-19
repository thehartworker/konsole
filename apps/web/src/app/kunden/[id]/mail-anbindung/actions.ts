"use server";

// Server-Actions für die Mail-Anbindungs-Konfiguration (Issue #52, Aufgabe
// E). Alle Speicherpfade laufen über den Session-Client (RLS ist die
// Durchsetzungsinstanz, AGENTS.md §4, siehe
// supabase/migrations/20260719140000_email_kanal.sql) -- die einzige
// Ausnahme ist die IMAP-Passwort-Verschlüsselung selbst, die über die
// mail_anbindung_imap_anlegen-RPC läuft (SECURITY INVOKER, RLS gilt
// trotzdem, siehe Kommentar in der Migration). Zod-Validierung serverseitig
// (AGENTS.md §5.3).

import { revalidatePath } from "next/cache";
import nodemailer from "nodemailer";
import { z } from "zod";
import { baueKonsolenAdresse, ProduktiverImapClient } from "@konsole/mail-ingest";
import { createClient } from "@/lib/supabase/server";
import { ladeKunde } from "@/lib/kunden";
import { ladeEigeneAgenturSlug } from "@/lib/mail-anbindung";

export type AktionsResultat = { status: "erfolg" } | { status: "fehler"; meldung: string };

async function angemeldetenNutzerLaden() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function mailIntakeDomain(): string {
  return process.env.MAIL_INTAKE_DOMAIN ?? "intake.example.de";
}

// ============================================================
// Modus A: Weiterleitung einrichten
// ============================================================

export type RichteWeiterleitungEinResultat =
  | { status: "erfolg"; anbindungId: string; konsolenAdresse: string }
  | { status: "fehler"; meldung: string };

export async function richteWeiterleitungEinAction(kundeId: string): Promise<RichteWeiterleitungEinResultat> {
  const { supabase, user } = await angemeldetenNutzerLaden();
  if (!user) return { status: "fehler", meldung: "Nicht angemeldet." };

  const kunde = await ladeKunde(supabase, kundeId);
  if (!kunde) return { status: "fehler", meldung: "Kunde nicht gefunden oder keine Berechtigung." };

  const agenturSlug = await ladeEigeneAgenturSlug(supabase);
  if (!agenturSlug) return { status: "fehler", meldung: "Eigene Agentur konnte nicht ermittelt werden." };

  const konsolenAdresse = baueKonsolenAdresse(agenturSlug, kunde.slug, mailIntakeDomain());

  // aktiv=false bis der Eintreffen-Test (unten) erfolgreich war -- siehe
  // Issue #52, Aufgabe D: "Falls ja: Anbindung als aktiv markieren."
  const { data, error } = await supabase
    .from("kunden_mail_anbindungen")
    .insert({ kunde_id: kundeId, anbindungs_typ: "weiterleitung", konsolen_adresse: konsolenAdresse, aktiv: false })
    .select("id")
    .single();

  if (error || !data) {
    return { status: "fehler", meldung: `Anbindung konnte nicht angelegt werden: ${error?.message ?? "unbekannter Fehler"}` };
  }

  revalidatePath(`/kunden/${kundeId}/mail-anbindung`);
  return { status: "erfolg", anbindungId: (data as { id: string }).id, konsolenAdresse };
}

const SMTP_TEST_TIMEOUT_MS = 60_000;
const SMTP_TEST_POLL_INTERVALL_MS = 3_000;

export type TesteKonsolenPostfachResultat = { status: "erfolg" } | { status: "fehler"; meldung: string };

export async function testeKonsolenPostfachEintreffenAction(
  kundeId: string,
  testId: string,
): Promise<TesteKonsolenPostfachResultat> {
  const { supabase, user } = await angemeldetenNutzerLaden();
  if (!user) return { status: "fehler", meldung: "Nicht angemeldet." };

  const { data: anbindung } = await supabase
    .from("kunden_mail_anbindungen")
    .select("id, konsolen_adresse")
    .eq("kunde_id", kundeId)
    .eq("anbindungs_typ", "weiterleitung")
    .is("deleted_at", null)
    .maybeSingle();

  if (!anbindung?.konsolen_adresse) {
    return { status: "fehler", meldung: "Keine weiterleitung-Anbindung für diesen Kunden gefunden. Zuerst einrichten." };
  }

  const smtpHost = process.env.KONSOLEN_TEST_SMTP_HOST;
  const smtpPort = process.env.KONSOLEN_TEST_SMTP_PORT;
  const smtpUser = process.env.KONSOLEN_TEST_SMTP_USER;
  const smtpPass = process.env.KONSOLEN_TEST_SMTP_PASS;
  const smtpAbsender = process.env.KONSOLEN_TEST_SMTP_ABSENDER;

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpAbsender) {
    return { status: "fehler", meldung: "SMTP-Konfiguration für den Verbindungstest fehlt (siehe apps/web/.env.example)." };
  }

  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: Number(smtpPort),
    secure: Number(smtpPort) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  let gesendeteMessageId: string;
  try {
    const info = await transport.sendMail({
      from: smtpAbsender,
      to: anbindung.konsolen_adresse as string,
      subject: `Konsole Verbindungstest ${testId}`,
      text: `Automatischer Verbindungstest für die Mail-Anbindung (test_id: ${testId}). Diese Mail kann ignoriert werden.`,
    });
    gesendeteMessageId = info.messageId;
  } catch (fehler) {
    return {
      status: "fehler",
      meldung: `Test-Mail konnte nicht gesendet werden: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
    };
  }

  const start = Date.now();
  while (Date.now() - start < SMTP_TEST_TIMEOUT_MS) {
    const { data: logEintrag } = await supabase.from("mail_eingang_log").select("id").eq("message_id", gesendeteMessageId).maybeSingle();

    if (logEintrag) {
      const { error: updateFehler } = await supabase.from("kunden_mail_anbindungen").update({ aktiv: true }).eq("id", anbindung.id);
      if (updateFehler) {
        return { status: "fehler", meldung: `Test-Mail kam an, aber Aktivieren schlug fehl: ${updateFehler.message}` };
      }
      revalidatePath(`/kunden/${kundeId}/mail-anbindung`);
      return { status: "erfolg" };
    }

    await new Promise((resolve) => setTimeout(resolve, SMTP_TEST_POLL_INTERVALL_MS));
  }

  return {
    status: "fehler",
    meldung: "Die Test-Mail ist innerhalb von 60 Sekunden nicht im Konsolen-Postfach eingetroffen. Weiterleitung beim Kunden prüfen.",
  };
}

// ============================================================
// Modus B: Direktes Kunden-Postfach einrichten
// ============================================================

const IMAP_EINRICHTEN_SCHEMA = z.object({
  host: z.string().trim().min(1, "Host darf nicht leer sein."),
  port: z.coerce.number().int().min(1).max(65535),
  benutzername: z.string().trim().min(1, "Benutzername darf nicht leer sein."),
  passwort: z.string().min(1, "Passwort darf nicht leer sein."),
});

export type RichteImapKundenpostfachEinResultat = { status: "erfolg"; anbindungId: string } | { status: "fehler"; meldung: string };

export async function richteImapKundenpostfachEinAction(
  kundeId: string,
  eingabe: { host: string; port: number | string; benutzername: string; passwort: string },
): Promise<RichteImapKundenpostfachEinResultat> {
  const geparst = IMAP_EINRICHTEN_SCHEMA.safeParse(eingabe);
  if (!geparst.success) {
    return { status: "fehler", meldung: "Bitte alle Felder gültig ausfüllen (Host, Port 1-65535, Benutzername, Passwort)." };
  }

  const { supabase, user } = await angemeldetenNutzerLaden();
  if (!user) return { status: "fehler", meldung: "Nicht angemeldet." };

  const kunde = await ladeKunde(supabase, kundeId);
  if (!kunde) return { status: "fehler", meldung: "Kunde nicht gefunden oder keine Berechtigung." };

  const testClient = new ProduktiverImapClient({
    host: geparst.data.host,
    port: geparst.data.port,
    benutzername: geparst.data.benutzername,
    passwort: geparst.data.passwort,
  });

  try {
    await testClient.connect();
    await testClient.disconnect();
  } catch (fehler) {
    return { status: "fehler", meldung: klassifiziereVerbindungsFehlerNachricht(fehler) };
  }

  const schluessel = process.env.IMAP_PASSWORT_VERSCHLUESSELUNGS_SCHLUESSEL;
  if (!schluessel) {
    return { status: "fehler", meldung: "Server-Konfiguration unvollständig (Verschlüsselungs-Schlüssel fehlt)." };
  }

  const { data: anbindungId, error } = await supabase.rpc("mail_anbindung_imap_anlegen", {
    p_kunde_id: kundeId,
    p_imap_host: geparst.data.host,
    p_imap_port: geparst.data.port,
    p_imap_benutzername: geparst.data.benutzername,
    p_imap_passwort_klartext: geparst.data.passwort,
    p_schluessel: schluessel,
  });

  if (error || !anbindungId) {
    return { status: "fehler", meldung: `Anbindung konnte nicht angelegt werden: ${error?.message ?? "unbekannter Fehler"}` };
  }

  revalidatePath(`/kunden/${kundeId}/mail-anbindung`);
  return { status: "erfolg", anbindungId: anbindungId as string };
}

function klassifiziereVerbindungsFehlerNachricht(fehler: unknown): string {
  const nachricht = fehler instanceof Error ? fehler.message : String(fehler);
  const ursache = fehler instanceof Error ? (fehler.cause as { code?: string } | undefined) : undefined;
  const code = ursache?.code;

  if (code && ["ENOTFOUND", "EHOSTUNREACH", "ECONNREFUSED", "ETIMEDOUT"].includes(code)) {
    return `Host nicht erreichbar (${code}).`;
  }
  if (/auth|credential|login|invalid.*password/i.test(nachricht)) {
    return `Zugangsdaten wurden abgelehnt: ${nachricht}`;
  }
  if (/tls|ssl|certificate/i.test(nachricht)) {
    return `TLS-Problem beim Verbindungsaufbau: ${nachricht}`;
  }
  return `Verbindung fehlgeschlagen: ${nachricht}`;
}

// ============================================================
// Deaktivieren/Löschen (beide Modi)
// ============================================================

export async function deaktiviereAnbindungAction(anbindungsId: string, kundeId: string): Promise<AktionsResultat> {
  const { supabase, user } = await angemeldetenNutzerLaden();
  if (!user) return { status: "fehler", meldung: "Nicht angemeldet." };

  const { error } = await supabase.from("kunden_mail_anbindungen").update({ aktiv: false }).eq("id", anbindungsId);
  if (error) return { status: "fehler", meldung: error.message };

  revalidatePath(`/kunden/${kundeId}/mail-anbindung`);
  return { status: "erfolg" };
}

export async function aktiviereAnbindungAction(anbindungsId: string, kundeId: string): Promise<AktionsResultat> {
  const { supabase, user } = await angemeldetenNutzerLaden();
  if (!user) return { status: "fehler", meldung: "Nicht angemeldet." };

  const { error } = await supabase.from("kunden_mail_anbindungen").update({ aktiv: true }).eq("id", anbindungsId);
  if (error) return { status: "fehler", meldung: error.message };

  revalidatePath(`/kunden/${kundeId}/mail-anbindung`);
  return { status: "erfolg" };
}

/** Soft-Delete (deleted_at, AGENTS.md §4) -- kaskadiert nicht auf bereits angelegte Vorgänge. */
export async function loeschAnbindungAction(anbindungsId: string, kundeId: string): Promise<AktionsResultat> {
  const { supabase, user } = await angemeldetenNutzerLaden();
  if (!user) return { status: "fehler", meldung: "Nicht angemeldet." };

  const { error } = await supabase
    .from("kunden_mail_anbindungen")
    .update({ deleted_at: new Date().toISOString(), aktiv: false })
    .eq("id", anbindungsId);
  if (error) return { status: "fehler", meldung: error.message };

  revalidatePath(`/kunden/${kundeId}/mail-anbindung`);
  return { status: "erfolg" };
}
