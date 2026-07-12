// Sensitivity-Erkennung per Hardrule, zusätzlich zur LLM-Klassifikation
// (Auftrag: "Sensitivity-Erkennung nach §3.3", siehe docs/decisions/2026-07-12_klassifikations-layer.md
// für die Herleitung der Stichwort-Muster aus §8.6/§9). Dient als
// deterministisches Sicherheitsnetz: falls das LLM eine Sensitivity
// unterschätzt, hebt die Hardrule sie an, schwächt aber nie ab.

import type { EingehendeNachricht } from './types.js';

export type NichtNormaleSensitivity =
  | 'vertraulich'
  | 'krise'
  | 'besonders_geschuetzt'
  | 'regulatorisch_relevant';

export interface SensitivitaetsTreffer {
  sensitivity: NichtNormaleSensitivity;
  ausloeser: string[];
}

// Reihenfolge ist Priorität bei mehreren gleichzeitigen Treffern: Krisen-
// Signale zuerst, weil sie den kürzesten SLA-Zeitrahmen haben (§12.2).
const MUSTER: Record<NichtNormaleSensitivity, RegExp[]> = {
  krise: [
    /\bkrise\b/i,
    /shitstorm/i,
    /skandal/i,
    /r(ü|ue)ckruf/i,
    /\bklage\b/i,
    /\banwalt\b/i,
    /vorwurf/i,
    /missstand/i,
  ],
  vertraulich: [
    /vertraulich/i,
    /embargo/i,
    /\bgeheim/i,
    /\bnda\b/i,
    /nicht ver(ö|oe)ffentlich/i,
    /unter verschluss/i,
  ],
  besonders_geschuetzt: [
    /diagnose/i,
    /erkrankung/i,
    /krankheit/i,
    /religi(ö|oe)s/i,
    /glaubensrichtung/i,
    /sexuelle orientierung/i,
    /gewerkschaft/i,
    /parteimitglied/i,
  ],
  regulatorisch_relevant: [
    /wirksamkeit/i,
    /nebenwirkung/i,
    /off-label/i,
    /\bhwg\b/i,
    /\bamg\b/i,
    /\bmdr\b/i,
    /studienergebnis/i,
    /arzneimittel/i,
    /wirkstoff/i,
    /verschreibungspflichtig/i,
  ],
};

export function erkenneSensitivitaetHardrules(
  nachricht: Pick<EingehendeNachricht, 'betreff' | 'inhalt_text'>,
): SensitivitaetsTreffer | null {
  const text = `${nachricht.betreff ?? ''}\n${nachricht.inhalt_text}`;

  for (const kategorie of Object.keys(MUSTER) as NichtNormaleSensitivity[]) {
    const ausloeser = MUSTER[kategorie].filter((muster) => muster.test(text)).map((muster) => muster.source);
    if (ausloeser.length > 0) {
      return { sensitivity: kategorie, ausloeser };
    }
  }

  return null;
}
