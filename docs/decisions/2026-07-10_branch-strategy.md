# Branch-Strategy

**Datum:** 2026-07-10
**Status:** vorgeschlagen

**Kontext:** Das Repo ist ein Multi-Person-Setup (Bastian als Reviewer, Claude Code als Bauer über die claude-code-action) mit Auto-Deployment: `main` deployt auf Produktion, eine Vor-Produktions-Umgebung wird über einen zweiten Branch bedient (siehe `AGENTS.md` §2, Deployment-Zeile). Es braucht eine klare Trennung zwischen dem Zustand, der auf Stage läuft, und dem Zustand, der auf Produktion läuft, damit Feature-Arbeit nicht ungeprüft in Produktion landet. GitHub Branch-Protection ist auf diesem Repo technisch nicht verfügbar, weil es ein persönliches Private-Repo ohne Team-Konto ist. Die Trennung muss also über eine klar dokumentierte Konvention laufen statt über eine technische Sperre.

**Optionen:**

1. Single-Branch (`main` only): Alle Änderungen laufen direkt auf `main`, jeder Commit deployt sofort auf Produktion.
2. Two-Branch (`main` + `stage`): Feature-PRs gehen gegen `stage`, `stage` deployt auf eine Vor-Produktions-Umgebung. Releases sind bewusste PRs von `stage` nach `main`.
3. Git-Flow (`main` + `develop` + `feature/*`): Zusätzlich zu `main` und `develop` bekommt jedes Feature einen eigenen Branch mit eigenem PR-Zyklus gegen `develop`.

**Entscheidung:** Option 2, Two-Branch mit `main` als Produktions-Branch und `stage` als Vor-Produktions-Branch.

Begründung:

- Single-Branch (Option 1) entfällt, weil jede Änderung, auch ein kleiner Agent-Commit, sofort live ginge. Bei einem Ein-Reviewer-Team mit hoher Agent-Automatisierung ist das Risiko eines ungeprüften Produktions-Vorfalls zu groß.
- Git-Flow (Option 3) entfällt, weil der zusätzliche `feature/*`-Layer für die aktuelle Team-Größe (ein Reviewer, ein bauender Agent) mehr Koordinations-Overhead erzeugt als er einbringt. Der Klassifikations-Layer und die Handler sind ohnehin über `docs/decisions/` konzeptionell vorab abgestimmt (siehe `AGENTS.md` §3.2), ein dritter Branch-Layer bringt dafür keinen zusätzlichen Nutzen.
- Two-Branch (Option 2) passt zum bestehenden Muster aus Akquiro (siehe `AGENTS.md` §3.1) und zur Auto-Deployment-Struktur: `stage` bildet den Vor-Produktions-Zustand ab, `main` den Produktions-Zustand. Der Merge von `stage` nach `main` ist damit die einzige Stelle, an der bewusst "live geschaltet" wird.

**Konsequenzen:**

- Alle Feature-PRs, inklusive aller Agent-PRs über die claude-code-action, gehen gegen `stage`, nicht gegen `main`.
- PRs von `stage` nach `main` sind bewusste Release-Aktionen mit passendem Commit-Titel ("Release YYYY-MM-DD" oder Feature-Rollup), keine automatisierten Merges.
- Keine Direct-Commits auf `main`, auch nicht für triviale Fixes.
- Branch-Protection ist auf diesem Repo nicht technisch durchgesetzt (persönliches Private-Repo ohne Team-Konto). Die obigen Regeln sind Konvention, keine technische Sperre. Details und die genaue Formulierung stehen in `AGENTS.md` §3.1.
- Offener Punkt: Sollte das Repo später auf ein Team-Konto migriert werden, kann Branch-Protection auf `main` (Pull-Request-Pflicht, keine Force-Pushes) technisch nachgezogen werden, ohne dass sich an dieser Konvention etwas ändert.
