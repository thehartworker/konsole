import { describe, expect, it } from 'vitest';
import { W2_DEFAULT_PRUEFREGELN, W2_HANDLER_SLUG } from '@konsole/handlers';
import { FakePruefregelnRepository } from '../src/testing/fake-pruefregeln-repository.js';

describe('FakePruefregelnRepository', () => {
  it('Default-Template: ein neu angelegter Kunde bekommt genau die 12 Default-Regeln zugewiesen', async () => {
    const repo = new FakePruefregelnRepository();

    await repo.defaultTemplateZuweisen('kunde-a', W2_DEFAULT_PRUEFREGELN);

    const regeln = await repo.aktivePruefregelnLaden('kunde-a', W2_HANDLER_SLUG);
    expect(regeln).toHaveLength(12);
  });

  it('Mandanten-Trennung beim Laden: Kunde A sieht nicht die Regeln von Kunde B', async () => {
    const repo = new FakePruefregelnRepository();

    await repo.defaultTemplateZuweisen('kunde-a', W2_DEFAULT_PRUEFREGELN);
    await repo.defaultTemplateZuweisen('kunde-b', [W2_DEFAULT_PRUEFREGELN[0]]);

    const regelnA = await repo.aktivePruefregelnLaden('kunde-a', W2_HANDLER_SLUG);
    const regelnB = await repo.aktivePruefregelnLaden('kunde-b', W2_HANDLER_SLUG);

    expect(regelnA).toHaveLength(12);
    expect(regelnB).toHaveLength(1);
    expect(regelnA.every((r) => regelnB.every((b) => b.id !== r.id))).toBe(true);
  });

  it('inaktive Regeln werden beim Laden nicht zurückgegeben', async () => {
    const repo = new FakePruefregelnRepository([
      {
        id: 'r1',
        kunde_id: 'kunde-a',
        handler_slug: W2_HANDLER_SLUG,
        typ: 'code_baustein',
        baustein_name: 'keine_tier_nennung',
        parameter: {},
        prompt_text: null,
        aktiv: false,
        reihenfolge: 1,
      },
    ]);

    const regeln = await repo.aktivePruefregelnLaden('kunde-a', W2_HANDLER_SLUG);
    expect(regeln).toHaveLength(0);
  });

  it('lädt sortiert nach reihenfolge', async () => {
    const repo = new FakePruefregelnRepository();
    await repo.defaultTemplateZuweisen('kunde-a', [...W2_DEFAULT_PRUEFREGELN].reverse());

    const regeln = await repo.aktivePruefregelnLaden('kunde-a', W2_HANDLER_SLUG);
    const reihenfolgen = regeln.map((r) => r.reihenfolge);
    expect(reihenfolgen).toEqual([...reihenfolgen].sort((a, b) => a - b));
  });
});
