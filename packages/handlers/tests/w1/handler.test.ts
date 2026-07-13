import { describe, expect, it } from 'vitest';
import { MockLLMProvider } from '@konsole/llm/testing';
import { fuehreW1Aus } from '../../src/w1/handler.js';
import { LeererW1KontextQuellenProvider } from '../../src/w1/kontext.js';
import type { Pruefregel } from '../../src/w2/regel-engine/types.js';
import type { W1KontextQuellenProvider, W1PraezedenzEintrag, W1SprecherEintrag } from '../../src/w1/types.js';
import { GUTER_DRAFT, GUTER_DRAFT_OHNE_ZITAT, W1_INPUT_BASIS } from './fixtures.js';

const OHNE_FINDINGS = { text: JSON.stringify({ kritiker_findings: [] }), tokenVerbrauch: { input_tokens: 200, output_tokens: 50 } };

class MitProfilProvider implements W1KontextQuellenProvider {
  async praezedenzenLaden(): Promise<W1PraezedenzEintrag[]> {
    return [{ titel: 'Frühere PM', volltext: 'Kunde X hat 2025 bereits eine ähnliche Linie gelauncht.' }];
  }
  async boilerplateLaden(): Promise<string | null> {
    return 'Kunde X ist ein führender Anbieter nachhaltiger Konsumgüter.';
  }
  async sprecherLaden(): Promise<W1SprecherEintrag | null> {
    return { name: 'Dr. Mara Beispiel', rolle: 'Geschäftsführung', exakte_schreibweise: 'Dr. Mara Beispiel', zitat_freigabe: true };
  }
}

function grenzeVerboteneAussage(phrase: string): Pruefregel {
  return {
    id: 'grenze-1',
    handler_slug: 'W1_pressemitteilung_drafter',
    typ: 'code_baustein',
    baustein_name: 'kundengrenze_verbotene_aussage',
    parameter: { phrase },
    prompt_text: null,
    aktiv: true,
    reihenfolge: 0,
  };
}

function grenzePflichtbaustein(text: string): Pruefregel {
  return {
    id: 'grenze-2',
    handler_slug: 'W1_pressemitteilung_drafter',
    typ: 'code_baustein',
    baustein_name: 'kundengrenze_pflichtbaustein',
    parameter: { text },
    prompt_text: null,
    aktiv: true,
    reihenfolge: 0,
  };
}

describe('fuehreW1Aus', () => {
  it('(a) voller Durchlauf: Briefing rein, Pressemitteilung raus, alle Felder korrekt', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } }, OHNE_FINDINGS],
    });

    const resultat = await fuehreW1Aus(W1_INPUT_BASIS, [], provider, {}, new MitProfilProvider());

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.output.pressemitteilung.headline).toBe(GUTER_DRAFT.headline);
      expect(resultat.output.ueberarbeitungsbeduerftig).toBe(false);
      expect(resultat.output.benoetigt_menschliche_freigabe).toBe(true);
      expect(resultat.output.freigabe_grund).toContain('redaktionell freigegeben');
      expect(resultat.output.vorschlaege_fuer_naechste_schritte).toContain('Freigabe durch Beraterin');
    }
    expect(resultat.llmAufrufe).toHaveLength(2);
    expect(resultat.llmAufrufe[0]?.zweck).toBe('draft');
    expect(resultat.llmAufrufe[1]?.zweck).toBe('kritiker');
  });

  it('(b) Profil-Nutzung: Tonalität/Boilerplate/Präzedenzen fließen aus dem Profil in den Drafter-Prompt', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } }, OHNE_FINDINGS],
    });

    await fuehreW1Aus(W1_INPUT_BASIS, [], provider, {}, new MitProfilProvider());

    const drafterPrompt = provider.aufrufe[0]?.prompt ?? '';
    expect(drafterPrompt).toContain('sachlich'); // Tonalität-Grundton aus kunde_kontext
    expect(drafterPrompt).toContain('führender Anbieter nachhaltiger Konsumgüter'); // Boilerplate aus dem Profil
    expect(drafterPrompt).toContain('ähnliche Linie gelauncht'); // Präzedenzfall aus dem Profil
  });

  it('(c) Präzedenz-Kalibrierung: der Prompt unterscheidet sich nachweislich mit vs. ohne Präzedenzen', async () => {
    const providerMit = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } }, OHNE_FINDINGS],
    });
    await fuehreW1Aus(W1_INPUT_BASIS, [], providerMit, {}, new MitProfilProvider());
    const promptMit = providerMit.aufrufe[0]?.prompt ?? '';

    const providerOhne = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } }, OHNE_FINDINGS],
    });
    await fuehreW1Aus(W1_INPUT_BASIS, [], providerOhne, {}, new LeererW1KontextQuellenProvider());
    const promptOhne = providerOhne.aufrufe[0]?.prompt ?? '';

    expect(promptMit).not.toBe(promptOhne);
    expect(promptMit).toContain('ähnliche Linie gelauncht');
    expect(promptOhne).not.toContain('ähnliche Linie gelauncht');
    expect(promptOhne).toContain('Kunden-SSOT aufsetzen');
  });

  it('(d) Kritiker "hoch"-Finding markiert den Draft als überarbeitungsbedürftig', async () => {
    const hochFinding = { text: JSON.stringify({ kritiker_findings: [{ schweregrad: 'hoch', finding: 'Zitat wirkt gestellt.', empfehlung: 'Mit Sprecher abstimmen.' }] }), tokenVerbrauch: { input_tokens: 200, output_tokens: 80 } };
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } }, hochFinding],
    });

    const resultat = await fuehreW1Aus(W1_INPUT_BASIS, [], provider, {}, new MitProfilProvider());

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.output.ueberarbeitungsbeduerftig).toBe(true);
      expect(resultat.output.kritiker_findings).toHaveLength(1);
    }
  });

  it('(e.1) deterministische Grenze: verbotene Aussage im Draft -> Finding + überarbeitungsbedürftig, unabhängig vom Kritiker', async () => {
    const grenze = grenzeVerboteneAussage('Verantwortung für die Umwelt');
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } }, OHNE_FINDINGS],
    });

    const resultat = await fuehreW1Aus(W1_INPUT_BASIS, [grenze], provider, {}, new MitProfilProvider());

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.output.grenz_pruefung_ergebnis.bestanden).toBe(false);
      expect(resultat.output.grenz_pruefung_ergebnis.verstoesse[0]?.baustein_name).toBe('kundengrenze_verbotene_aussage');
      expect(resultat.output.ueberarbeitungsbeduerftig).toBe(true);
    }
  });

  it('(e.2) deterministische Grenze: fehlender Pflichtbaustein wird erkannt', async () => {
    const grenze = grenzePflichtbaustein('Pflichthinweis gemäß Heilmittelwerbegesetz');
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } }, OHNE_FINDINGS],
    });

    const resultat = await fuehreW1Aus(W1_INPUT_BASIS, [grenze], provider, {}, new MitProfilProvider());

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.output.grenz_pruefung_ergebnis.bestanden).toBe(false);
      expect(resultat.output.grenz_pruefung_ergebnis.verstoesse[0]?.baustein_name).toBe('kundengrenze_pflichtbaustein');
    }
  });

  it('(f) Fallback: keine Präzedenzen im Profil -> Hinweis im Output, Draft trotzdem erfolgreich', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(GUTER_DRAFT_OHNE_ZITAT), tokenVerbrauch: { input_tokens: 400, output_tokens: 200 } }, OHNE_FINDINGS],
    });

    const resultat = await fuehreW1Aus(W1_INPUT_BASIS, [], provider); // kein kontextProvider -> LeererW1KontextQuellenProvider

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.output.hinweise.some((h) => h.includes('Kunden-SSOT aufsetzen'))).toBe(true);
    }
  });

  it('(g) Fallback: Kritiker-Pass fällt aus (Timeout) -> Draft geht ohne Findings raus, mit Vermerk', async () => {
    let aufrufZaehler = 0;
    const provider = {
      strukturierteCompletion: async () => {
        aufrufZaehler += 1;
        if (aufrufZaehler === 1) {
          return { text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 }, modell: 'mock-model' };
        }
        throw new Error('Kritiker-Timeout');
      },
    };

    const resultat = await fuehreW1Aus(W1_INPUT_BASIS, [], provider, {}, new MitProfilProvider());

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.output.kritiker_findings).toHaveLength(0);
      expect(resultat.output.hinweise.some((h) => h.includes('Kritiker-Prüfung nicht möglich'))).toBe(true);
    }
    expect(resultat.llmAufrufe).toHaveLength(1); // nur der Drafter-Aufruf wurde abgerechnet, der Kritiker-Aufruf lieferte keine Antwort
  });

  it('(h) Shadow-Mode: löst nichts aus, keine unerklärten Zusatz-Calls über die gezählten LLM-Aufrufe hinaus', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } }, OHNE_FINDINGS],
    });

    const resultat = await fuehreW1Aus(W1_INPUT_BASIS, [], provider, {}, new MitProfilProvider());

    expect(provider.aufrufe).toHaveLength(resultat.llmAufrufe.length);
    if (resultat.status === 'erfolg') {
      expect(resultat.output).not.toHaveProperty('versendet');
      expect(resultat.output).not.toHaveProperty('handler_ausgeloest');
    }
  });

  it('(i) Zitat-Freigabe-Erzwingung: fehlende Freigabe entfernt das Zitat deterministisch, unabhängig vom LLM', async () => {
    // LeererW1KontextQuellenProvider liefert keinen Sprecher -> kontext.sprecher.verfuegbar = false,
    // aber der Drafter-Mock generiert trotzdem ein Zitat (GUTER_DRAFT) -- das Sicherheitsnetz muss greifen.
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } }, OHNE_FINDINGS],
    });

    const resultat = await fuehreW1Aus(W1_INPUT_BASIS, [], provider, {}, new LeererW1KontextQuellenProvider());

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.output.pressemitteilung.zitat).toBeNull();
      expect(resultat.output.hinweise.some((h) => h.includes('Zitat entfernt'))).toBe(true);
    }
    // Der Kritiker-Pass darf nur den bereinigten (zitatlosen) Text sehen.
    const kritikerPrompt = provider.aufrufe[1]?.prompt ?? '';
    expect(kritikerPrompt).not.toContain('Wir übernehmen Verantwortung für die Umwelt.');
  });

  it('(j) Draft-Fehlschlag: Gesamtlauf fehlgeschlagen, Kritiker-Pass läuft nicht mehr an', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify({ unsinn: true }), tokenVerbrauch: { input_tokens: 10, output_tokens: 5 } }],
    });

    const resultat = await fuehreW1Aus(W1_INPUT_BASIS, [], provider, {}, new MitProfilProvider());

    expect(resultat.status).toBe('fehlgeschlagen');
    if (resultat.status === 'fehlgeschlagen') {
      expect(resultat.fehler).toContain('Zod-Validierung fehlgeschlagen');
    }
    expect(resultat.llmAufrufe).toHaveLength(1); // nur der gescheiterte Draft-Versuch wurde abgerechnet
    expect(provider.aufrufe).toHaveLength(1);
  });

  it('(k) Token-Verbrauch wird über Drafter- und Kritiker-Pass korrekt aufsummiert', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } }, OHNE_FINDINGS],
    });

    const resultat = await fuehreW1Aus(W1_INPUT_BASIS, [], provider, {}, new MitProfilProvider());

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.output.audit_metadaten.tokens_input).toBe(700);
      expect(resultat.output.audit_metadaten.tokens_output).toBe(350);
      expect(resultat.output.audit_metadaten.dauer_ms).toBeGreaterThanOrEqual(0);
    }
  });
});
