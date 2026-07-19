// Produktive MailIngestRepository-Implementierung über den Supabase
// Service-Role-Client (RLS-Bypass, analog zu SupabaseKlassifikationsRepository
// in packages/persistence -- der Ingest-Pfad läuft laut
// docs/decisions/2026-07-10_rls-policies.md, "Konsequenzen", mit der
// Service-Role). Liest KEINE Env-Variablen und erzeugt KEINEN eigenen
// Client -- der Aufrufer (main.ts) übergibt ihn per Dependency Injection.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnhangMetadaten, KundenMailAnbindung, MailAnbindungsTyp } from '@konsole/mail-ingest';
import type { MailEingangLogEintrag, MailIngestRepository, ModusBVerbindungsdaten, VorgangAnlegenEingabe } from './types.js';

interface KundenMailAnbindungZeile {
  id: string;
  kunde_id: string;
  agentur_id: string;
  anbindungs_typ: MailAnbindungsTyp;
  konsolen_adresse: string | null;
  aktiv: boolean;
}

function pruefeFehler(fehler: { message: string } | null, kontext: string): void {
  if (fehler) {
    throw new Error(`SupabaseMailIngestRepository.${kontext}: ${fehler.message}`);
  }
}

export class SupabaseMailIngestRepository implements MailIngestRepository {
  constructor(private readonly client: SupabaseClient) {}

  async aktiveAnbindungenLaden(): Promise<KundenMailAnbindung[]> {
    const { data, error } = await this.client
      .from('kunden_mail_anbindungen')
      .select('id, kunde_id, agentur_id, anbindungs_typ, konsolen_adresse, aktiv')
      .eq('aktiv', true)
      .is('deleted_at', null);

    pruefeFehler(error, 'aktiveAnbindungenLaden');

    return ((data ?? []) as KundenMailAnbindungZeile[]).map((zeile) => ({
      id: zeile.id,
      kundeId: zeile.kunde_id,
      agenturId: zeile.agentur_id,
      anbindungsTyp: zeile.anbindungs_typ,
      konsolenAdresse: zeile.konsolen_adresse,
      aktiv: zeile.aktiv,
    }));
  }

  async istDuplikat(messageId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('mail_eingang_log')
      .select('id')
      .eq('message_id', messageId)
      .maybeSingle();

    pruefeFehler(error, 'istDuplikat');
    return data !== null;
  }

  async kundeSlugLaden(kundeId: string): Promise<string | null> {
    const { data, error } = await this.client.from('kunden').select('slug').eq('id', kundeId).is('deleted_at', null).maybeSingle();
    pruefeFehler(error, 'kundeSlugLaden');
    return (data as { slug: string } | null)?.slug ?? null;
  }

  async vorgangAnlegen(eingabe: VorgangAnlegenEingabe): Promise<string> {
    const { data, error } = await this.client
      .from('vorgaenge')
      .insert({
        agentur_id: eingabe.agenturId,
        kunde_id: eingabe.kundeId,
        kanal: 'email',
        absender_identifikator: eingabe.absenderIdentifikator,
        eingang_at: eingabe.eingangAt,
        betreff: eingabe.betreff,
        inhalt_text: eingabe.inhaltText,
        metadaten_kanalspezifisch: eingabe.metadatenKanalspezifisch,
      })
      .select('id')
      .single();

    pruefeFehler(error, 'vorgangAnlegen');
    return (data as { id: string }).id;
  }

  async vorgangAnhaengeAktualisieren(vorgangId: string, anhaenge: AnhangMetadaten[]): Promise<void> {
    const { error } = await this.client
      .from('vorgaenge')
      .update({
        anhaenge: anhaenge.map((anhang) => ({
          dateiname: anhang.dateiname,
          typ: anhang.contentType,
          groesse_bytes: anhang.groesseBytes,
          bucket_pfad: anhang.bucketPfad,
        })),
      })
      .eq('id', vorgangId);

    pruefeFehler(error, 'vorgangAnhaengeAktualisieren');
  }

  async mailEingangLogSchreiben(eintrag: MailEingangLogEintrag): Promise<void> {
    const { error } = await this.client.from('mail_eingang_log').insert({
      message_id: eintrag.messageId,
      kunden_mail_anbindung_id: eintrag.kundenMailAnbindungId,
      vorgang_id: eintrag.vorgangId,
      verarbeitungs_status: eintrag.verarbeitungsStatus,
      fehler_meldung: eintrag.fehlerMeldung ?? null,
    });

    pruefeFehler(error, 'mailEingangLogSchreiben');
  }

  async modusBVerbindungsdatenLaden(anbindungId: string): Promise<ModusBVerbindungsdaten | null> {
    const { data, error } = await this.client
      .from('kunden_mail_anbindungen')
      .select('imap_host, imap_port, imap_benutzername, imap_ordner, verarbeitet_ordner')
      .eq('id', anbindungId)
      .eq('anbindungs_typ', 'imap_kundenpostfach')
      .maybeSingle();

    pruefeFehler(error, 'modusBVerbindungsdatenLaden');
    if (!data) return null;

    const zeile = data as {
      imap_host: string | null;
      imap_port: number | null;
      imap_benutzername: string | null;
      imap_ordner: string;
      verarbeitet_ordner: string;
    };
    if (!zeile.imap_host || !zeile.imap_port || !zeile.imap_benutzername) return null;

    return {
      imapHost: zeile.imap_host,
      imapPort: zeile.imap_port,
      imapBenutzername: zeile.imap_benutzername,
      imapOrdner: zeile.imap_ordner,
      verarbeitetOrdner: zeile.verarbeitet_ordner,
    };
  }

  async passwortEntschluesseln(anbindungId: string, schluessel: string): Promise<string | null> {
    const { data, error } = await this.client.rpc('mail_anbindung_passwort_entschluesseln', {
      p_anbindung_id: anbindungId,
      p_schluessel: schluessel,
    });

    pruefeFehler(error, 'passwortEntschluesseln');
    return (data as string | null) ?? null;
  }
}
