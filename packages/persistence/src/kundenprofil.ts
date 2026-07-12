// Persistenz-Schicht für das Kundenprofil (Issue #35, Kundenprofil-
// Fundament): der zentrale Wissenskern, aus dem alle Handler ihr
// kundenspezifisches Wissen schöpfen, statt es per Input mitgegeben zu
// bekommen. Siehe docs/decisions/2026-07-12_kundenprofil.md für die volle
// Begründung, analog zu PruefregelnRepository (packages/persistence/src/pruefregeln.ts)
// im Aufbau (Interface + Supabase-Implementierung, Fake-Implementierung in
// src/testing/).

import type { SupabaseClient } from '@supabase/supabase-js';
import { W2_HANDLER_SLUG } from '@konsole/handlers';
import type { Pruefregel, PraezedenzEintrag, SprachregelungsEintrag, W2KontextQuellenProvider, W2KundeKontextInput } from '@konsole/handlers';

export type KundenProfilElementStatus = 'freigegeben' | 'vorlaeufig' | 'abgeleitet';

export interface KundenProfilFeldStatusEintrag {
  status: KundenProfilElementStatus;
  stand?: string | null;
  quelle?: string | null;
}

export type KundenProfilFeldStatus = Record<string, KundenProfilFeldStatusEintrag>;

export interface KundenProfilKern {
  id: string;
  kunde_id: string;
  agentur_id: string;
  rechtsform: string | null;
  sitz: string | null;
  geschaeftsbeschreibung: string | null;
  corporate_design_ref: string | null;
  grundton: string | null;
  anrede_konvention: 'du' | 'sie' | null;
  gendering_konvention: string | null;
  stil_parameter: Record<string, unknown>;
  zielsprache_absender_texte: string | null;
  positionierung: string | null;
  usp: string | null;
  feld_status: KundenProfilFeldStatus;
  aktive_handler: string[];
}

export interface KundenBoilerplateZeile {
  id: string;
  kunde_id: string;
  typ: 'kurz' | 'lang';
  sprache: string;
  text: string;
  status: KundenProfilElementStatus;
  stand: string | null;
}

export interface KundenKennzahlenZeile {
  id: string;
  kunde_id: string;
  bezeichnung: string;
  wert: string;
  stichtag: string;
  quelle: string;
  status: KundenProfilElementStatus;
}

export interface KundenSprecherZeile {
  id: string;
  kunde_id: string;
  name: string;
  rolle: string | null;
  exakte_schreibweise: string | null;
  zitat_freigabe: boolean;
  status: KundenProfilElementStatus;
}

export interface KundenKernbotschaftZeile {
  id: string;
  kunde_id: string;
  text: string;
  reihenfolge: number;
  status: KundenProfilElementStatus;
}

export interface KundenThemaZeile {
  id: string;
  kunde_id: string;
  thema: string;
  sprachregelung: string | null;
  reaktives_statement: string | null;
  positionierung_vorhanden: boolean;
  status: KundenProfilElementStatus;
}

export type KundenGrenzenTyp =
  | 'no_go_thema'
  | 'nicht_nennbarer_wettbewerber'
  | 'nicht_nennbare_person'
  | 'verbotene_aussage'
  | 'pflichtbaustein';

export interface KundenGrenzeZeile {
  id: string;
  kunde_id: string;
  typ: KundenGrenzenTyp;
  inhalt: string;
  textart_geltungsbereich: string | null;
  ist_deterministisch_erzwungen: boolean;
  status: KundenProfilElementStatus;
}

export interface KundenFreigabekettenZeile {
  id: string;
  kunde_id: string;
  rolle_oder_person: string;
  reihenfolge: number;
  bedingung: string | null;
  status: KundenProfilElementStatus;
}

export interface KundenPraezedenzfallZeile {
  id: string;
  kunde_id: string;
  handler_slug: string;
  titel: string;
  volltext: string;
  freigegeben_am: string | null;
  status: KundenProfilElementStatus;
}

export interface KundenMedienKontextZeile {
  id: string;
  kunde_id: string;
  medium_name: string;
  journalist_name: string | null;
  beziehungsnotiz: string | null;
  prioritaet: 'hoch' | 'mittel' | 'niedrig' | null;
  status: KundenProfilElementStatus;
}

export interface KundenProfil {
  kern: KundenProfilKern | null;
  boilerplate: KundenBoilerplateZeile[];
  kennzahlen: KundenKennzahlenZeile[];
  sprecher: KundenSprecherZeile[];
  kernbotschaften: KundenKernbotschaftZeile[];
  themen: KundenThemaZeile[];
  grenzen: KundenGrenzeZeile[];
  freigabekette: KundenFreigabekettenZeile[];
  praezedenzfaelle: KundenPraezedenzfallZeile[];
  medienKontext: KundenMedienKontextZeile[];
}

export type KundenProfilListenTabelle =
  | 'kunden_boilerplate'
  | 'kunden_kennzahlen'
  | 'kunden_sprecher'
  | 'kunden_kernbotschaften'
  | 'kunden_themen'
  | 'kunden_grenzen'
  | 'kunden_freigabekette'
  | 'kunden_praezedenzfaelle'
  | 'kunden_medien_kontext';

/**
 * Übersetzt eine deterministisch erzwungene kunden_grenzen-Zeile in eine
 * synthetische Pruefregel (existiert nicht in der pruefregeln-Tabelle,
 * siehe Decision, Abschnitt "Deterministisch erzwungene Grenzen").
 */
function grenzeAlsPruefregel(
  zeile: { id: string; typ: KundenGrenzenTyp; inhalt: string },
  handlerSlug: string,
): Pruefregel {
  const bausteinName = zeile.typ === 'verbotene_aussage' ? 'kundengrenze_verbotene_aussage' : 'kundengrenze_pflichtbaustein';
  const parameter = zeile.typ === 'verbotene_aussage' ? { phrase: zeile.inhalt } : { text: zeile.inhalt };
  return {
    id: `kundengrenze-${zeile.id}`,
    handler_slug: handlerSlug,
    typ: 'code_baustein',
    baustein_name: bausteinName,
    parameter,
    prompt_text: null,
    aktiv: true,
    reihenfolge: 0,
  };
}

export interface KundenProfilRepository {
  profilLaden(kundeId: string): Promise<KundenProfil>;
  feldStatusSetzen(kundeId: string, feldname: string, status: KundenProfilElementStatus): Promise<void>;
  elementStatusSetzen(tabelle: KundenProfilListenTabelle, id: string, status: KundenProfilElementStatus): Promise<void>;
  w2KontextLaden(kundeId: string): Promise<W2KundeKontextInput>;
  w2KontextQuellenProviderErstellen(kundeId: string): W2KontextQuellenProvider;
  deterministischeGrenzenAlsPruefregeln(kundeId: string, handlerSlug: string): Promise<Pruefregel[]>;
}

function pruefeFehler(fehler: { message: string } | null, kontext: string): void {
  if (fehler) {
    throw new Error(`SupabaseKundenProfilRepository.${kontext}: ${fehler.message}`);
  }
}

/**
 * Injizierbare Quelle der zwei in W2 angebundenen RAG-Quellen
 * (Sprachregelungen aus kunden_themen, Präzedenzfälle aus
 * kunden_praezedenzfaelle), gebunden an einen konkreten Kunden. Siehe
 * Decision, Abschnitt "Handler-Anbindung": nur `status = 'freigegeben'`-
 * Präzedenzfälle fließen als Kalibrierungs-Referenz ein, ein nur
 * abgeleiteter Präzedenzfall wird wie ein fehlender behandelt (bestehender
 * Fallback-Hinweis in packages/handlers/src/w2/kontext.ts greift
 * unverändert).
 */
export class KundenProfilW2KontextQuellenProvider implements W2KontextQuellenProvider {
  constructor(
    private readonly client: SupabaseClient,
    private readonly kundeId: string,
  ) {}

  async sprachregelungenLaden(_sprachregelungenSlug: string, _thema: string): Promise<SprachregelungsEintrag[]> {
    const { data, error } = await this.client
      .from('kunden_themen')
      .select('thema, sprachregelung')
      .eq('kunde_id', this.kundeId)
      .not('sprachregelung', 'is', null)
      .is('deleted_at', null);

    pruefeFehler(error, 'sprachregelungenLaden');
    return (data ?? []).map((zeile) => ({ thema: zeile.thema as string, position_text: zeile.sprachregelung as string }));
  }

  async praezedenzenLaden(_kundeSlug: string, _thema: string): Promise<PraezedenzEintrag[]> {
    const { data, error } = await this.client
      .from('kunden_praezedenzfaelle')
      .select('titel, volltext')
      .eq('kunde_id', this.kundeId)
      .eq('handler_slug', W2_HANDLER_SLUG)
      .eq('status', 'freigegeben')
      .is('deleted_at', null);

    pruefeFehler(error, 'praezedenzenLaden');
    return (data ?? []).map((zeile) => ({ anfrage_thema: zeile.titel as string, antwort_auszug: zeile.volltext as string }));
  }
}

export class SupabaseKundenProfilRepository implements KundenProfilRepository {
  constructor(private readonly client: SupabaseClient) {}

  async profilLaden(kundeId: string): Promise<KundenProfil> {
    const [kern, boilerplate, kennzahlen, sprecher, kernbotschaften, themen, grenzen, freigabekette, praezedenzfaelle, medienKontext] =
      await Promise.all([
        this.client.from('kunden_profil').select('*').eq('kunde_id', kundeId).is('deleted_at', null).maybeSingle(),
        this.client.from('kunden_boilerplate').select('*').eq('kunde_id', kundeId).is('deleted_at', null),
        this.client.from('kunden_kennzahlen').select('*').eq('kunde_id', kundeId).is('deleted_at', null),
        this.client.from('kunden_sprecher').select('*').eq('kunde_id', kundeId).is('deleted_at', null),
        this.client
          .from('kunden_kernbotschaften')
          .select('*')
          .eq('kunde_id', kundeId)
          .is('deleted_at', null)
          .order('reihenfolge', { ascending: true }),
        this.client.from('kunden_themen').select('*').eq('kunde_id', kundeId).is('deleted_at', null),
        this.client.from('kunden_grenzen').select('*').eq('kunde_id', kundeId).is('deleted_at', null),
        this.client
          .from('kunden_freigabekette')
          .select('*')
          .eq('kunde_id', kundeId)
          .is('deleted_at', null)
          .order('reihenfolge', { ascending: true }),
        this.client.from('kunden_praezedenzfaelle').select('*').eq('kunde_id', kundeId).is('deleted_at', null),
        this.client.from('kunden_medien_kontext').select('*').eq('kunde_id', kundeId).is('deleted_at', null),
      ]);

    pruefeFehler(kern.error, 'profilLaden(kern)');
    pruefeFehler(boilerplate.error, 'profilLaden(boilerplate)');
    pruefeFehler(kennzahlen.error, 'profilLaden(kennzahlen)');
    pruefeFehler(sprecher.error, 'profilLaden(sprecher)');
    pruefeFehler(kernbotschaften.error, 'profilLaden(kernbotschaften)');
    pruefeFehler(themen.error, 'profilLaden(themen)');
    pruefeFehler(grenzen.error, 'profilLaden(grenzen)');
    pruefeFehler(freigabekette.error, 'profilLaden(freigabekette)');
    pruefeFehler(praezedenzfaelle.error, 'profilLaden(praezedenzfaelle)');
    pruefeFehler(medienKontext.error, 'profilLaden(medienKontext)');

    return {
      kern: (kern.data as KundenProfilKern | null) ?? null,
      boilerplate: (boilerplate.data ?? []) as KundenBoilerplateZeile[],
      kennzahlen: (kennzahlen.data ?? []) as KundenKennzahlenZeile[],
      sprecher: (sprecher.data ?? []) as KundenSprecherZeile[],
      kernbotschaften: (kernbotschaften.data ?? []) as KundenKernbotschaftZeile[],
      themen: (themen.data ?? []) as KundenThemaZeile[],
      grenzen: (grenzen.data ?? []) as KundenGrenzeZeile[],
      freigabekette: (freigabekette.data ?? []) as KundenFreigabekettenZeile[],
      praezedenzfaelle: (praezedenzfaelle.data ?? []) as KundenPraezedenzfallZeile[],
      medienKontext: (medienKontext.data ?? []) as KundenMedienKontextZeile[],
    };
  }

  async feldStatusSetzen(kundeId: string, feldname: string, status: KundenProfilElementStatus): Promise<void> {
    const { data, error } = await this.client
      .from('kunden_profil')
      .select('feld_status')
      .eq('kunde_id', kundeId)
      .is('deleted_at', null)
      .maybeSingle();
    pruefeFehler(error, 'feldStatusSetzen(laden)');

    const bestehend = (data?.feld_status ?? {}) as KundenProfilFeldStatus;
    const aktualisiert: KundenProfilFeldStatus = {
      ...bestehend,
      [feldname]: { ...bestehend[feldname], status },
    };

    const { error: schreibFehler } = await this.client
      .from('kunden_profil')
      .update({ feld_status: aktualisiert })
      .eq('kunde_id', kundeId);
    pruefeFehler(schreibFehler, 'feldStatusSetzen(schreiben)');
  }

  async elementStatusSetzen(tabelle: KundenProfilListenTabelle, id: string, status: KundenProfilElementStatus): Promise<void> {
    const { error } = await this.client.from(tabelle).update({ status }).eq('id', id);
    pruefeFehler(error, `elementStatusSetzen(${tabelle})`);
  }

  async w2KontextLaden(kundeId: string): Promise<W2KundeKontextInput> {
    const { data: kunde, error: kundeFehler } = await this.client.from('kunden').select('slug').eq('id', kundeId).maybeSingle();
    pruefeFehler(kundeFehler, 'w2KontextLaden(kunde)');
    if (!kunde) {
      throw new Error(`SupabaseKundenProfilRepository.w2KontextLaden: kunde ${kundeId} existiert nicht oder ist gelöscht.`);
    }

    const { data: profil, error: profilFehler } = await this.client
      .from('kunden_profil')
      .select('positionierung, feld_status')
      .eq('kunde_id', kundeId)
      .is('deleted_at', null)
      .maybeSingle();
    pruefeFehler(profilFehler, 'w2KontextLaden(profil)');

    const positionierungStatus = (profil?.feld_status as KundenProfilFeldStatus | undefined)?.positionierung?.status;
    // Nur freigegebene oder vorläufig bestätigte Positionierung fließt in einen
    // echten Kunden-Output ein, ein rein abgeleiteter Vorschlag NICHT (siehe
    // Decision, Abschnitt "Handler-Anbindung").
    const thema_positionierung =
      profil?.positionierung && positionierungStatus !== 'abgeleitet' ? (profil.positionierung as string) : null;

    return {
      kunde_slug: kunde.slug as string,
      sprachregelungen_slug: kunde.slug as string,
      thema_positionierung,
    };
  }

  w2KontextQuellenProviderErstellen(kundeId: string): W2KontextQuellenProvider {
    return new KundenProfilW2KontextQuellenProvider(this.client, kundeId);
  }

  async deterministischeGrenzenAlsPruefregeln(kundeId: string, handlerSlug: string): Promise<Pruefregel[]> {
    const { data, error } = await this.client
      .from('kunden_grenzen')
      .select('id, typ, inhalt')
      .eq('kunde_id', kundeId)
      .eq('ist_deterministisch_erzwungen', true)
      .in('typ', ['verbotene_aussage', 'pflichtbaustein'])
      .is('deleted_at', null);
    pruefeFehler(error, 'deterministischeGrenzenAlsPruefregeln');

    return (data ?? []).map((zeile) =>
      grenzeAlsPruefregel(zeile as { id: string; typ: KundenGrenzenTyp; inhalt: string }, handlerSlug),
    );
  }
}

export { grenzeAlsPruefregel };
