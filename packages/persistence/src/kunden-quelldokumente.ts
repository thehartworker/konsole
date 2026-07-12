// Persistenz-Schicht für kunden_quelldokumente (Issue #37, Ebene 3
// KI-Befüllung, PR 2): Lesezugriff auf die Referenz-Zeile plus Download aus
// Supabase Storage (Bucket-Setup siehe supabase/storage/kunden_quelldokumente_bucket.sql,
// PR 1) und Fortschreiben von extraktion_status nach einem Extraktions-
// Versuch. Siehe docs/decisions/2026-07-12_kundenprofil-ki-befuellung.md,
// Abschnitt "Datei-Storage".

import type { SupabaseClient } from '@supabase/supabase-js';

export type KundenQuelldokumentExtraktionStatus = 'ausstehend' | 'verarbeitet' | 'fehlgeschlagen';

export interface KundenQuelldokumentZeile {
  id: string;
  kunde_id: string;
  bucket_pfad: string;
  dateiname: string;
  mime_typ: string | null;
  extraktion_status: KundenQuelldokumentExtraktionStatus;
}

export interface KundenQuelldokumenteRepository {
  quelldokumentLaden(id: string): Promise<KundenQuelldokumentZeile | null>;
  /** Lädt die Rohdatei aus Supabase Storage (Bucket "kunden_quelldokumente"). */
  dateiInhaltLaden(bucketPfad: string): Promise<Uint8Array>;
  extraktionStatusSetzen(id: string, status: KundenQuelldokumentExtraktionStatus): Promise<void>;
}

const STORAGE_BUCKET = 'kunden_quelldokumente';

function pruefeFehler(fehler: { message: string } | null, kontext: string): void {
  if (fehler) {
    throw new Error(`SupabaseKundenQuelldokumenteRepository.${kontext}: ${fehler.message}`);
  }
}

export class SupabaseKundenQuelldokumenteRepository implements KundenQuelldokumenteRepository {
  constructor(private readonly client: SupabaseClient) {}

  async quelldokumentLaden(id: string): Promise<KundenQuelldokumentZeile | null> {
    const { data, error } = await this.client
      .from('kunden_quelldokumente')
      .select('id, kunde_id, bucket_pfad, dateiname, mime_typ, extraktion_status')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    pruefeFehler(error, 'quelldokumentLaden');
    return (data as KundenQuelldokumentZeile | null) ?? null;
  }

  async dateiInhaltLaden(bucketPfad: string): Promise<Uint8Array> {
    const { data, error } = await this.client.storage.from(STORAGE_BUCKET).download(bucketPfad);
    if (error) {
      throw new Error(`SupabaseKundenQuelldokumenteRepository.dateiInhaltLaden: ${error.message}`);
    }
    if (!data) {
      throw new Error(`SupabaseKundenQuelldokumenteRepository.dateiInhaltLaden: kein Datei-Inhalt für "${bucketPfad}".`);
    }
    return new Uint8Array(await data.arrayBuffer());
  }

  async extraktionStatusSetzen(id: string, status: KundenQuelldokumentExtraktionStatus): Promise<void> {
    const { error } = await this.client.from('kunden_quelldokumente').update({ extraktion_status: status }).eq('id', id);
    pruefeFehler(error, 'extraktionStatusSetzen');
  }
}
