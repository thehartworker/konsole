"use client";

// Haupt-Komponente des Kundenprofil-Editors (Issue #50, Aufgabe B/C/D):
// verteilt den serverseitig geladenen Profil-Zustand auf die Kern-Feld- und
// Listen-Komponenten (die ihren jeweiligen Bearbeitungs-Zustand selbst
// halten, siehe kern-feld.tsx/listen-tabelle.tsx) und hält zusätzlich den
// Zustand, der NUR hier zusammenläuft: die Vorschlags-Liste einer laufenden
// Extraktion (Aufgabe C/D) und die "gerade übernommenen" Vorschläge, bevor
// ein voller Seiten-Reload den echten Server-Stand zeigen würde.
//
// "Übernommene" Vorschläge werden über einen key-Wechsel auf der
// betroffenen Kern-Feld-/Listen-Komponente sichtbar gemacht (siehe
// kernUebernommen/listenUebernommen unten): die Komponenten selbst
// initialisieren ihren Zustand nur beim Mounten aus initialWert/initialZeilen,
// ein reiner Prop-Wechsel würde ihren internen Zustand NICHT zurücksetzen --
// der key-Wechsel erzwingt an genau dieser Stelle einen sauberen Remount mit
// dem neuen Ausgangswert, ohne einen globalen Reducer über das gesamte
// Profil zu brauchen.

import { useState } from "react";
import type { KundenProfil, KundenProfilElementStatus, KundenProfilFeldStatusEintrag, KundenProfilListenTabelle } from "@konsole/persistence";
import { KERN_FELDER, LISTEN_TABELLEN, SEKTIONEN } from "@/lib/kundenprofil-felder";
import type { Vorschlag } from "@/lib/profil-vorschlaege";
import { entferneListenzeileAction, speichereKopfFeldAction } from "../actions";
import { ExtraktionsAktionen } from "./extraktion-aktionen";
import { KernFeld } from "./kern-feld";
import { ListenTabelle, type AnzeigeZeile } from "./listen-tabelle";
import { Sektion } from "./sektion";
import { VorschlaegePanel } from "./vorschlaege-panel";

interface VorschlaegeZustand {
  vorschlaege: Vorschlag[];
  quelleBezeichnung: string;
  erstelltAm: string;
  unklareHinweise: string[];
}

function listeAusProfil(profil: KundenProfil, tabelle: KundenProfilListenTabelle): AnzeigeZeile[] {
  switch (tabelle) {
    case "kunden_boilerplate":
      return profil.boilerplate as unknown as AnzeigeZeile[];
    case "kunden_kennzahlen":
      return profil.kennzahlen as unknown as AnzeigeZeile[];
    case "kunden_sprecher":
      return profil.sprecher as unknown as AnzeigeZeile[];
    case "kunden_kernbotschaften":
      return profil.kernbotschaften as unknown as AnzeigeZeile[];
    case "kunden_themen":
      return profil.themen as unknown as AnzeigeZeile[];
    case "kunden_grenzen":
      return profil.grenzen as unknown as AnzeigeZeile[];
    case "kunden_freigabekette":
      return profil.freigabekette as unknown as AnzeigeZeile[];
    case "kunden_praezedenzfaelle":
      return profil.praezedenzfaelle as unknown as AnzeigeZeile[];
    case "kunden_medien_kontext":
      return profil.medienKontext as unknown as AnzeigeZeile[];
    default: {
      const unbekannt: never = tabelle;
      throw new Error(`listeAusProfil: unbekannte Tabelle "${String(unbekannt)}"`);
    }
  }
}

export function ProfilEditor({ kundeId, initialProfil }: { kundeId: string; initialProfil: KundenProfil }) {
  const [vorschlaegeZustand, setVorschlaegeZustand] = useState<VorschlaegeZustand | null>(null);
  const [kernUebernommen, setKernUebernommen] = useState<Record<string, { wert: unknown; feldStatus: KundenProfilFeldStatusEintrag }>>({});
  const [listenUebernommen, setListenUebernommen] = useState<Partial<Record<KundenProfilListenTabelle, AnzeigeZeile[]>>>({});
  const [vorschlagIdZuEingefuegterId, setVorschlagIdZuEingefuegterId] = useState<Record<string, string>>({});

  function effektiverListenInhalt(tabelle: KundenProfilListenTabelle): AnzeigeZeile[] {
    return [...listeAusProfil(initialProfil, tabelle), ...(listenUebernommen[tabelle] ?? [])];
  }

  function onUebernommen(vorschlag: Vorschlag, eingefuegteId?: string) {
    if (vorschlag.ziel.art === "kern") {
      const status: KundenProfilElementStatus = "abgeleitet";
      setKernUebernommen((bisherig) => ({
        ...bisherig,
        [vorschlag.ziel.feldname]: {
          wert: vorschlag.wertAnzeige,
          feldStatus: { status, quelle: vorschlag.quelle, stand: vorschlag.stand },
        },
      }));
      return;
    }

    if (!eingefuegteId) return;
    const tabelle = vorschlag.ziel.tabelle;
    const neueZeile: AnzeigeZeile = {
      id: eingefuegteId,
      status: "abgeleitet",
      herkunft: vorschlag.quelle,
      updated_at: new Date().toISOString(),
      ...vorschlag.ziel.zeile,
    };
    setListenUebernommen((bisherig) => ({ ...bisherig, [tabelle]: [...(bisherig[tabelle] ?? []), neueZeile] }));
    setVorschlagIdZuEingefuegterId((bisherig) => ({ ...bisherig, [vorschlag.id]: eingefuegteId }));
  }

  async function onUebernahmeRueckgaengig(vorschlag: Vorschlag) {
    if (vorschlag.ziel.art === "kern") {
      const feldname = vorschlag.ziel.feldname;
      const kernRaw = initialProfil.kern as unknown as Record<string, unknown> | null;
      const urspruenglicherWert = kernRaw?.[feldname] ?? null;
      const urspruenglicherStatus = initialProfil.kern?.feld_status?.[feldname]?.status ?? "vorlaeufig";
      setKernUebernommen((bisherig) => {
        const kopie = { ...bisherig };
        delete kopie[feldname];
        return kopie;
      });
      await speichereKopfFeldAction(kundeId, feldname, urspruenglicherWert, urspruenglicherStatus);
      return;
    }

    const tabelle = vorschlag.ziel.tabelle;
    const eingefuegteId = vorschlagIdZuEingefuegterId[vorschlag.id];
    setListenUebernommen((bisherig) => ({
      ...bisherig,
      [tabelle]: (bisherig[tabelle] ?? []).filter((zeile) => zeile.id !== eingefuegteId),
    }));
    if (eingefuegteId) {
      await entferneListenzeileAction(tabelle, eingefuegteId, kundeId);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">Kundenprofil</p>
        <ExtraktionsAktionen
          kundeId={kundeId}
          onErgebnis={(ergebnis) =>
            setVorschlaegeZustand({
              vorschlaege: ergebnis.vorschlaege,
              quelleBezeichnung: ergebnis.quelleBezeichnung,
              erstelltAm: ergebnis.erstelltAm,
              unklareHinweise: ergebnis.unklareHinweise,
            })
          }
        />
      </div>

      {vorschlaegeZustand && (
        <VorschlaegePanel
          kundeId={kundeId}
          vorschlaege={vorschlaegeZustand.vorschlaege}
          quelleBezeichnung={vorschlaegeZustand.quelleBezeichnung}
          erstelltAm={vorschlaegeZustand.erstelltAm}
          unklareHinweise={vorschlaegeZustand.unklareHinweise}
          onVorschlaegeGeaendert={(neuOderUpdater) =>
            setVorschlaegeZustand((bisherig) => {
              if (!bisherig) return bisherig;
              const neu = typeof neuOderUpdater === "function" ? neuOderUpdater(bisherig.vorschlaege) : neuOderUpdater;
              return { ...bisherig, vorschlaege: neu };
            })
          }
          onUebernommen={onUebernommen}
          onUebernahmeRueckgaengig={onUebernahmeRueckgaengig}
        />
      )}

      {SEKTIONEN.map((sektion) => {
        const kernFelderInSektion = KERN_FELDER.filter((feld) => feld.sektion === sektion.key);
        const listenInSektion = LISTEN_TABELLEN.filter((tabelle) => tabelle.sektion === sektion.key);

        const listenZaehlerTeile = listenInSektion.map((konfiguration) => {
          const zeilen = effektiverListenInhalt(konfiguration.tabelle);
          const offen = zeilen.filter((zeile) => zeile.status !== "freigegeben").length;
          if (zeilen.length === 0) return null;
          return offen > 0 ? `${zeilen.length} ${konfiguration.label}, ${offen} offen` : `${zeilen.length} ${konfiguration.label}`;
        });
        const zaehlerText = listenZaehlerTeile.filter((teil): teil is string => teil !== null).join(" · ") || undefined;

        return (
          <Sektion key={sektion.key} titel={sektion.label} zaehlerText={zaehlerText ?? "keine Listen-Einträge"}>
            {kernFelderInSektion.length > 0 && (
              <div className="divide-y divide-border">
                {kernFelderInSektion.map((konfiguration) => {
                  const override = kernUebernommen[konfiguration.key];
                  const initialWert = override ? override.wert : (initialProfil.kern as unknown as Record<string, unknown> | null)?.[konfiguration.key];
                  const initialStatus = override ? override.feldStatus : initialProfil.kern?.feld_status?.[konfiguration.key];
                  return (
                    <KernFeld
                      key={`${konfiguration.key}-${override ? "uebernommen" : "initial"}`}
                      kundeId={kundeId}
                      konfiguration={konfiguration}
                      initialWert={initialWert ?? null}
                      initialStatus={initialStatus}
                    />
                  );
                })}
              </div>
            )}

            {listenInSektion.map((konfiguration) => (
              <div key={konfiguration.tabelle}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{konfiguration.label}</h3>
                <div className="mt-2">
                  <ListenTabelle
                    key={`${konfiguration.tabelle}-${(listenUebernommen[konfiguration.tabelle] ?? []).length}`}
                    kundeId={kundeId}
                    konfiguration={konfiguration}
                    initialZeilen={effektiverListenInhalt(konfiguration.tabelle)}
                  />
                </div>
              </div>
            ))}
          </Sektion>
        );
      })}
    </div>
  );
}
