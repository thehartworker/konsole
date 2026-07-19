// SpeichereAnhaenge (Issue #52, Aufgabe B): schreibt jedes Attachment in den
// Storage-Bucket "mail_anhaenge" (supabase/storage/mail_anhaenge_bucket.sql).
// Der Supabase-Client wird injiziert (Dependency Injection, wie
// SupabaseKlassifikationsRepository in packages/persistence) -- dieses Paket
// erzeugt keinen eigenen Client und liest keine Env-Vars.
//
// Registrierung in vorgaenge.anhaenge (das jsonb-Feld) ist NICHT Teil dieser
// Funktion, sondern Sache des Aufrufers (apps/mail-ingest): dieses Paket
// kennt das vorgaenge-Schema nicht, nur den Storage-Upload.

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Anhang } from './types.js';

export const MAIL_ANHAENGE_BUCKET = 'mail_anhaenge';

export interface AnhangMetadaten {
  dateiname: string;
  contentType: string;
  groesseBytes: number;
  bucketPfad: string;
}

export interface SpeichereAnhaengeKontext {
  agenturId: string;
  kundeId: string;
  vorgangId: string;
}

export async function speichereAnhaenge(
  anhaenge: Anhang[],
  kontext: SpeichereAnhaengeKontext,
  supabaseClient: SupabaseClient,
): Promise<AnhangMetadaten[]> {
  const ergebnis: AnhangMetadaten[] = [];

  for (const anhang of anhaenge) {
    const bucketPfad = `${kontext.agenturId}/${kontext.kundeId}/${kontext.vorgangId}/${randomUUID()}-${anhang.dateiname}`;

    const { error } = await supabaseClient.storage
      .from(MAIL_ANHAENGE_BUCKET)
      .upload(bucketPfad, anhang.inhalt, { contentType: anhang.contentType });

    if (error) {
      throw new Error(`speichereAnhaenge: Upload für "${anhang.dateiname}" fehlgeschlagen: ${error.message}`);
    }

    ergebnis.push({
      dateiname: anhang.dateiname,
      contentType: anhang.contentType,
      groesseBytes: anhang.groesseBytes,
      bucketPfad,
    });
  }

  return ergebnis;
}
