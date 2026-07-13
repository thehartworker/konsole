// In-Memory-Fake von KundenQuelldokumenteRepository für Tests: kein echtes
// Supabase Storage nötig, Datei-Inhalte werden direkt im Options-Objekt
// hinterlegt (Byte-Array statt echtem Bucket-Download).

import type {
  KundenQuelldokumentExtraktionStatus,
  KundenQuelldokumentZeile,
  KundenQuelldokumenteRepository,
} from '../kunden-quelldokumente.js';

export interface FakeKundenQuelldokumenteRepositoryOptions {
  quelldokumente?: KundenQuelldokumentZeile[];
  /** Schlüssel: bucket_pfad. */
  dateiInhalte?: Record<string, Uint8Array>;
}

export class FakeKundenQuelldokumenteRepository implements KundenQuelldokumenteRepository {
  readonly quelldokumente: KundenQuelldokumentZeile[];
  private readonly dateiInhalte: Map<string, Uint8Array>;

  constructor(options: FakeKundenQuelldokumenteRepositoryOptions = {}) {
    this.quelldokumente = [...(options.quelldokumente ?? [])];
    this.dateiInhalte = new Map(Object.entries(options.dateiInhalte ?? {}));
  }

  async quelldokumentLaden(id: string): Promise<KundenQuelldokumentZeile | null> {
    return this.quelldokumente.find((zeile) => zeile.id === id) ?? null;
  }

  async dateiInhaltLaden(bucketPfad: string): Promise<Uint8Array> {
    const inhalt = this.dateiInhalte.get(bucketPfad);
    if (!inhalt) {
      throw new Error(`FakeKundenQuelldokumenteRepository.dateiInhaltLaden: kein Datei-Inhalt für "${bucketPfad}" konfiguriert.`);
    }
    return inhalt;
  }

  async extraktionStatusSetzen(id: string, status: KundenQuelldokumentExtraktionStatus): Promise<void> {
    const zeile = this.quelldokumente.find((eintrag) => eintrag.id === id);
    if (zeile) zeile.extraktion_status = status;
  }
}
