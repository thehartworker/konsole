import type { W1Output } from "@konsole/handlers";

// Rendert die Pressemitteilung in ihre Struktur-Segmente zerlegt (nicht als
// Fließtext-Block), jedes mit data-segment markiert, damit Block 2
// (Inline-Editing) pro Feld andocken kann, ohne die Darstellung neu zu
// strukturieren. Siehe
// docs/decisions/2026-07-13_konsole-block1-vorgangs-detailansicht.md,
// Abschnitt 7.

export function PressemitteilungAnsicht({ output }: { output: W1Output }) {
  const { pressemitteilung } = output;

  return (
    <div className="space-y-4">
      <div data-segment="headline">
        <h3 className="text-base font-semibold text-ink">{pressemitteilung.headline}</h3>
        {pressemitteilung.sub_headline && (
          <p data-segment="sub_headline" className="text-sm text-ink-muted">
            {pressemitteilung.sub_headline}
          </p>
        )}
      </div>

      <p data-segment="ort_datum" className="text-xs text-ink-muted">
        {pressemitteilung.ort_datum}
      </p>

      <p data-segment="lead_absatz" className="text-sm font-medium text-ink">
        {pressemitteilung.lead_absatz}
      </p>

      <div data-segment="ausfuehrung_absaetze" className="space-y-3">
        {pressemitteilung.ausfuehrung_absaetze.map((absatz, index) => (
          <p key={index} data-segment={`ausfuehrung_absaetze.${index}`} className="text-sm text-ink">
            {absatz}
          </p>
        ))}
      </div>

      {pressemitteilung.zitat && (
        <blockquote data-segment="zitat" className="border-l-4 border-border pl-4 text-sm italic text-ink">
          „{pressemitteilung.zitat.text}“
          <footer className="mt-1 not-italic text-xs text-ink-muted">
            {pressemitteilung.zitat.sprecher_name}, {pressemitteilung.zitat.sprecher_rolle}
          </footer>
        </blockquote>
      )}

      <p data-segment="boilerplate" className="text-xs text-ink-muted">
        {pressemitteilung.boilerplate}
      </p>

      <p data-segment="kontakt_fusszeile" className="text-xs text-ink-muted whitespace-pre-wrap">
        {pressemitteilung.kontakt_fusszeile}
      </p>
    </div>
  );
}
