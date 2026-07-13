// In-Memory-Fake von KundenProfilRepository für Tests, analog zu
// FakePruefregelnRepository: kein echtes Netzwerk, keine echte Postgres-
// Instanz nötig (die bleibt der pgTAP-Suite vorbehalten, siehe
// supabase/tests/database/13_kundenprofil_rls.test.sql und
// 14_kundenprofil_status_uebergang.test.sql). Erlaubt, gestuft befüllte
// Profile (nur Pflicht-Minimum) und Status-Übergänge direkt zu inspizieren.

import { W1_HANDLER_SLUG, W2_HANDLER_SLUG } from '@konsole/handlers';
import type {
  PraezedenzEintrag,
  SprachregelungsEintrag,
  W1KontextQuellenProvider,
  W1KundeKontextInput,
  W1PraezedenzEintrag,
  W1SprecherEintrag,
  W2KontextQuellenProvider,
  W2KundeKontextInput,
  Pruefregel,
} from '@konsole/handlers';
import type { ProfilExtraktionsQuelle } from '@konsole/profil-extraktion';
import { filterDubletten } from '../aehnlichkeit.js';
import {
  grenzeAlsPruefregel,
  type KundenBoilerplateZeile,
  type KundenFreigabekettenZeile,
  type KundenGrenzeZeile,
  type KundenKennzahlenZeile,
  type KundenKernbotschaftZeile,
  type KundenMedienKontextZeile,
  type KundenPraezedenzfallZeile,
  type KundenProfil,
  type KundenProfilElementStatus,
  type KundenProfilKern,
  type KundenProfilKernVorschlagsFelder,
  type KundenProfilListenTabelle,
  type KundenProfilListenVorschlagEingabe,
  type KundenProfilListenVorschlagTabelle,
  type KundenProfilRepository,
  type KundenProfilVorschlagResultat,
  type KundenSprecherZeile,
  type KundenThemaZeile,
} from '../kundenprofil.js';

let fakeListenElementIdZaehler = 0;

function defaultKern(kundeId: string): KundenProfilKern {
  return {
    id: `fake-kunden-profil-${kundeId}`,
    kunde_id: kundeId,
    agentur_id: 'fake-agentur',
    rechtsform: null,
    sitz: null,
    geschaeftsbeschreibung: null,
    corporate_design_ref: null,
    grundton: null,
    anrede_konvention: null,
    gendering_konvention: null,
    stil_parameter: {},
    zielsprache_absender_texte: null,
    positionierung: null,
    usp: null,
    feld_status: {},
    aktive_handler: [],
  };
}

export interface FakeKundenProfilRepositoryOptions {
  /** kunde_id -> slug, nötig für w2KontextLaden (Fake kennt keine kunden-Tabelle). */
  kundenSlugs?: Record<string, string>;
  kern?: Record<string, Partial<KundenProfilKern>>;
  boilerplate?: KundenBoilerplateZeile[];
  kennzahlen?: KundenKennzahlenZeile[];
  sprecher?: KundenSprecherZeile[];
  kernbotschaften?: KundenKernbotschaftZeile[];
  themen?: KundenThemaZeile[];
  grenzen?: KundenGrenzeZeile[];
  freigabekette?: KundenFreigabekettenZeile[];
  praezedenzfaelle?: KundenPraezedenzfallZeile[];
  medienKontext?: KundenMedienKontextZeile[];
}

class FakeW2KontextQuellenProvider implements W2KontextQuellenProvider {
  constructor(
    private readonly repo: FakeKundenProfilRepository,
    private readonly kundeId: string,
  ) {}

  async sprachregelungenLaden(_sprachregelungenSlug: string, _thema: string): Promise<SprachregelungsEintrag[]> {
    return this.repo.themen
      .filter((zeile) => zeile.kunde_id === this.kundeId && zeile.sprachregelung !== null)
      .map((zeile) => ({ thema: zeile.thema, position_text: zeile.sprachregelung as string }));
  }

  async praezedenzenLaden(_kundeSlug: string, _thema: string): Promise<PraezedenzEintrag[]> {
    return this.repo.praezedenzfaelle
      .filter(
        (zeile) => zeile.kunde_id === this.kundeId && zeile.handler_slug === W2_HANDLER_SLUG && zeile.status === 'freigegeben',
      )
      .map((zeile) => ({ anfrage_thema: zeile.titel, antwort_auszug: zeile.volltext }));
  }
}

class FakeW1KontextQuellenProvider implements W1KontextQuellenProvider {
  constructor(
    private readonly repo: FakeKundenProfilRepository,
    private readonly kundeId: string,
  ) {}

  async praezedenzenLaden(_kundeSlug: string, _anlass: string): Promise<W1PraezedenzEintrag[]> {
    return this.repo.praezedenzfaelle
      .filter(
        (zeile) => zeile.kunde_id === this.kundeId && zeile.handler_slug === W1_HANDLER_SLUG && zeile.status === 'freigegeben',
      )
      .map((zeile) => ({ titel: zeile.titel, volltext: zeile.volltext }));
  }

  async boilerplateLaden(_kundeSlug: string, laenge: 'kurz' | 'lang', sprache: string): Promise<string | null> {
    const treffer = this.repo.boilerplate
      .filter(
        (zeile) =>
          zeile.kunde_id === this.kundeId && zeile.typ === laenge && zeile.sprache === sprache && zeile.status !== 'abgeleitet',
      )
      .sort((a, b) => (b.stand ?? '').localeCompare(a.stand ?? ''));
    return treffer[0]?.text ?? null;
  }

  async sprecherLaden(_kundeSlug: string, sprecherName: string): Promise<W1SprecherEintrag | null> {
    const zeile = this.repo.sprecher.find((eintrag) => eintrag.kunde_id === this.kundeId && eintrag.name === sprecherName);
    if (!zeile) return null;
    return {
      name: zeile.name,
      rolle: zeile.rolle,
      exakte_schreibweise: zeile.exakte_schreibweise,
      zitat_freigabe: zeile.zitat_freigabe,
    };
  }
}

export class FakeKundenProfilRepository implements KundenProfilRepository {
  private readonly kundenSlugs: Map<string, string>;
  readonly kern: Map<string, KundenProfilKern>;
  readonly boilerplate: KundenBoilerplateZeile[];
  readonly kennzahlen: KundenKennzahlenZeile[];
  readonly sprecher: KundenSprecherZeile[];
  readonly kernbotschaften: KundenKernbotschaftZeile[];
  readonly themen: KundenThemaZeile[];
  readonly grenzen: KundenGrenzeZeile[];
  readonly freigabekette: KundenFreigabekettenZeile[];
  readonly praezedenzfaelle: KundenPraezedenzfallZeile[];
  readonly medienKontext: KundenMedienKontextZeile[];

  constructor(options: FakeKundenProfilRepositoryOptions = {}) {
    this.kundenSlugs = new Map(Object.entries(options.kundenSlugs ?? {}));
    this.kern = new Map(
      Object.entries(options.kern ?? {}).map(([kundeId, teil]) => [kundeId, { ...defaultKern(kundeId), ...teil }]),
    );
    this.boilerplate = [...(options.boilerplate ?? [])];
    this.kennzahlen = [...(options.kennzahlen ?? [])];
    this.sprecher = [...(options.sprecher ?? [])];
    this.kernbotschaften = [...(options.kernbotschaften ?? [])];
    this.themen = [...(options.themen ?? [])];
    this.grenzen = [...(options.grenzen ?? [])];
    this.freigabekette = [...(options.freigabekette ?? [])];
    this.praezedenzfaelle = [...(options.praezedenzfaelle ?? [])];
    this.medienKontext = [...(options.medienKontext ?? [])];
  }

  async profilLaden(kundeId: string): Promise<KundenProfil> {
    return {
      kern: this.kern.get(kundeId) ?? null,
      boilerplate: this.boilerplate.filter((zeile) => zeile.kunde_id === kundeId),
      kennzahlen: this.kennzahlen.filter((zeile) => zeile.kunde_id === kundeId),
      sprecher: this.sprecher.filter((zeile) => zeile.kunde_id === kundeId),
      kernbotschaften: this.kernbotschaften.filter((zeile) => zeile.kunde_id === kundeId).sort((a, b) => a.reihenfolge - b.reihenfolge),
      themen: this.themen.filter((zeile) => zeile.kunde_id === kundeId),
      grenzen: this.grenzen.filter((zeile) => zeile.kunde_id === kundeId),
      freigabekette: this.freigabekette.filter((zeile) => zeile.kunde_id === kundeId).sort((a, b) => a.reihenfolge - b.reihenfolge),
      praezedenzfaelle: this.praezedenzfaelle.filter((zeile) => zeile.kunde_id === kundeId),
      medienKontext: this.medienKontext.filter((zeile) => zeile.kunde_id === kundeId),
    };
  }

  async feldStatusSetzen(kundeId: string, feldname: string, status: KundenProfilElementStatus): Promise<void> {
    const bestehend = this.kern.get(kundeId);
    if (!bestehend) return; // gestuft befüllbar: kein Kern-Datensatz ist ein gültiger Zustand, kein Fehler
    bestehend.feld_status = { ...bestehend.feld_status, [feldname]: { ...bestehend.feld_status[feldname], status } };
  }

  async elementStatusSetzen(tabelle: KundenProfilListenTabelle, id: string, status: KundenProfilElementStatus): Promise<void> {
    const zeile = this.listeFuer(tabelle).find((eintrag) => eintrag.id === id);
    if (zeile) zeile.status = status;
  }

  async w2KontextLaden(kundeId: string): Promise<W2KundeKontextInput> {
    const slug = this.kundenSlugs.get(kundeId);
    if (!slug) {
      throw new Error(`FakeKundenProfilRepository.w2KontextLaden: kunde ${kundeId} existiert nicht oder ist gelöscht.`);
    }
    const kern = this.kern.get(kundeId);
    const positionierungStatus = kern?.feld_status.positionierung?.status;
    const thema_positionierung = kern?.positionierung && positionierungStatus !== 'abgeleitet' ? kern.positionierung : null;

    return { kunde_slug: slug, sprachregelungen_slug: slug, thema_positionierung };
  }

  w2KontextQuellenProviderErstellen(kundeId: string): W2KontextQuellenProvider {
    return new FakeW2KontextQuellenProvider(this, kundeId);
  }

  async w1KontextLaden(kundeId: string): Promise<W1KundeKontextInput> {
    const slug = this.kundenSlugs.get(kundeId);
    if (!slug) {
      throw new Error(`FakeKundenProfilRepository.w1KontextLaden: kunde ${kundeId} existiert nicht oder ist gelöscht.`);
    }
    const kern = this.kern.get(kundeId);

    return {
      kunde_slug: slug,
      tonalitaet: {
        grundton: kern?.grundton ?? null,
        stil_parameter: kern?.stil_parameter ?? {},
        anrede_konvention: kern?.anrede_konvention ?? null,
        gendering_konvention: kern?.gendering_konvention ?? null,
      },
    };
  }

  w1KontextQuellenProviderErstellen(kundeId: string): W1KontextQuellenProvider {
    return new FakeW1KontextQuellenProvider(this, kundeId);
  }

  async deterministischeGrenzenAlsPruefregeln(kundeId: string, handlerSlug: string): Promise<Pruefregel[]> {
    return this.grenzen
      .filter(
        (zeile) =>
          zeile.kunde_id === kundeId &&
          zeile.ist_deterministisch_erzwungen &&
          (zeile.typ === 'verbotene_aussage' || zeile.typ === 'pflichtbaustein'),
      )
      .map((zeile) => grenzeAlsPruefregel(zeile, handlerSlug));
  }

  async kernFelderVorschlagen(
    kundeId: string,
    felder: KundenProfilKernVorschlagsFelder,
    quelle: ProfilExtraktionsQuelle,
    stand: string,
  ): Promise<void> {
    const bestehend = this.kern.get(kundeId);
    const bestehenderFeldStatus = bestehend?.feld_status ?? {};
    const zuAktualisieren: Record<string, unknown> = {};
    const neuerFeldStatus = { ...bestehenderFeldStatus };

    for (const [feldname, wert] of Object.entries(felder)) {
      if (wert === null || wert === undefined) continue; // "nicht belegbar" darf kein bestehendes Feld leeren
      if (bestehenderFeldStatus[feldname]?.status === 'freigegeben') continue; // Nicht-Überschreiben-Regel
      zuAktualisieren[feldname] = wert;
      neuerFeldStatus[feldname] = { status: 'abgeleitet', quelle, stand };
    }

    if (Object.keys(zuAktualisieren).length === 0) return;

    const basis = bestehend ?? defaultKern(kundeId);
    this.kern.set(kundeId, { ...basis, ...zuAktualisieren, feld_status: neuerFeldStatus });
  }

  async listenElementeVorschlagen(eingabe: KundenProfilListenVorschlagEingabe): Promise<KundenProfilVorschlagResultat> {
    const { tabelle, kundeId, zeilen, vergleichsSchluessel, quelle } = eingabe;
    if (zeilen.length === 0) return { eingefuegt: 0, dublettenUebersprungen: 0 };

    const bestehendeZeilen = this.alleZeilenFuer(tabelle, kundeId);
    const bestehendeSchluessel = bestehendeZeilen.map((zeile) => vergleichsSchluessel(zeile));
    const { einzufuegen, dublettenUebersprungen } = filterDubletten(zeilen, bestehendeSchluessel, vergleichsSchluessel);

    for (const zeile of einzufuegen) {
      fakeListenElementIdZaehler += 1;
      this.zeileHinzufuegen(tabelle, {
        id: `fake-${tabelle}-${fakeListenElementIdZaehler}`,
        kunde_id: kundeId,
        status: 'abgeleitet',
        herkunft: quelle,
        ...zeile,
      });
    }

    return { eingefuegt: einzufuegen.length, dublettenUebersprungen };
  }

  private alleZeilenFuer(tabelle: KundenProfilListenVorschlagTabelle, kundeId: string): Record<string, unknown>[] {
    switch (tabelle) {
      case 'kunden_boilerplate':
        return this.boilerplate.filter((zeile) => zeile.kunde_id === kundeId) as unknown as Record<string, unknown>[];
      case 'kunden_kennzahlen':
        return this.kennzahlen.filter((zeile) => zeile.kunde_id === kundeId) as unknown as Record<string, unknown>[];
      case 'kunden_sprecher':
        return this.sprecher.filter((zeile) => zeile.kunde_id === kundeId) as unknown as Record<string, unknown>[];
      case 'kunden_kernbotschaften':
        return this.kernbotschaften.filter((zeile) => zeile.kunde_id === kundeId) as unknown as Record<string, unknown>[];
      case 'kunden_themen':
        return this.themen.filter((zeile) => zeile.kunde_id === kundeId) as unknown as Record<string, unknown>[];
      case 'kunden_grenzen':
        return this.grenzen.filter((zeile) => zeile.kunde_id === kundeId) as unknown as Record<string, unknown>[];
      case 'kunden_medien_kontext':
        return this.medienKontext.filter((zeile) => zeile.kunde_id === kundeId) as unknown as Record<string, unknown>[];
      default: {
        const unbekannt: never = tabelle;
        throw new Error(`FakeKundenProfilRepository: unbekannte Listen-Vorschlag-Tabelle "${String(unbekannt)}"`);
      }
    }
  }

  private zeileHinzufuegen(tabelle: KundenProfilListenVorschlagTabelle, zeile: Record<string, unknown>): void {
    switch (tabelle) {
      case 'kunden_boilerplate':
        this.boilerplate.push(zeile as unknown as KundenBoilerplateZeile);
        return;
      case 'kunden_kennzahlen':
        this.kennzahlen.push(zeile as unknown as KundenKennzahlenZeile);
        return;
      case 'kunden_sprecher':
        this.sprecher.push(zeile as unknown as KundenSprecherZeile);
        return;
      case 'kunden_kernbotschaften':
        this.kernbotschaften.push(zeile as unknown as KundenKernbotschaftZeile);
        return;
      case 'kunden_themen':
        this.themen.push(zeile as unknown as KundenThemaZeile);
        return;
      case 'kunden_grenzen':
        this.grenzen.push(zeile as unknown as KundenGrenzeZeile);
        return;
      case 'kunden_medien_kontext':
        this.medienKontext.push(zeile as unknown as KundenMedienKontextZeile);
        return;
      default: {
        const unbekannt: never = tabelle;
        throw new Error(`FakeKundenProfilRepository: unbekannte Listen-Vorschlag-Tabelle "${String(unbekannt)}"`);
      }
    }
  }

  private listeFuer(tabelle: KundenProfilListenTabelle): Array<{ id: string; status: KundenProfilElementStatus }> {
    switch (tabelle) {
      case 'kunden_boilerplate':
        return this.boilerplate;
      case 'kunden_kennzahlen':
        return this.kennzahlen;
      case 'kunden_sprecher':
        return this.sprecher;
      case 'kunden_kernbotschaften':
        return this.kernbotschaften;
      case 'kunden_themen':
        return this.themen;
      case 'kunden_grenzen':
        return this.grenzen;
      case 'kunden_freigabekette':
        return this.freigabekette;
      case 'kunden_praezedenzfaelle':
        return this.praezedenzfaelle;
      case 'kunden_medien_kontext':
        return this.medienKontext;
      default: {
        const unbekannt: never = tabelle;
        throw new Error(`FakeKundenProfilRepository: unbekannte Listen-Tabelle "${String(unbekannt)}"`);
      }
    }
  }
}
