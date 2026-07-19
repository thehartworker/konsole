import Link from "next/link";

// Minimale Konsolen-Navigation (Issue #50, Aufgabe A): "die bestehende
// /vorgaenge-Liste hatte offenbar auch keine [Navigation] -- Struktur an
// dieser Stelle sauber ziehen". Bewusst schlicht (drei feste Links, kein
// aktiver-Link-Highlighting, keine Rollen-Ausblendung) -- eine vollständige
// Header-Komponente mit Rollen-abhängigen Einträgen ist nicht Teil dieses
// Blocks, nur der geforderte "Kunden"-Eintrag zwischen "Vorgänge" und
// "Konto".
export function KonsolenNav() {
  return (
    <nav aria-label="Konsole" className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3 text-sm">
        <span className="font-semibold text-ink">Konsole</span>
        <Link href="/vorgaenge" className="text-ink-muted hover:text-ink">
          Vorgänge
        </Link>
        <Link href="/kunden" className="text-ink-muted hover:text-ink">
          Kunden
        </Link>
        <Link href="/konto" className="text-ink-muted hover:text-ink">
          Konto
        </Link>
      </div>
    </nav>
  );
}
