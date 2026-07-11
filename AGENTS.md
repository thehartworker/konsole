# AGENTS.md

Diese Datei ist die Grundinstruktion für alle AI-Coding-Agenten, die in diesem Repository arbeiten (primär Claude Code über die claude-code-action). Sie ergänzt und präzisiert die vier Spec-Dokumente im Root:

- `SAAS_SPEC_v0.1_CONSOLE.md` — Kern-Produkt-Spec der Intake-Konsole
- `WORKFLOW_HANDLERS_v0.1.md` — die sechs Backend-Handler
- `BUILD_PLAN_v0.1.md` — 8-Wochen-Bauplan mit drei parallelen Spuren
- `GESELLSCHAFT_UND_PILOT_v0.1.md` — Gesellschaftsgründung und MENSCH-Pilot

**Wenn du als Agent hier arbeitest: lies alle vier Specs, bevor du irgendetwas Substanzielles baust.** Das ist keine Empfehlung, das ist Voraussetzung.

---

## 1. Projekt in einem Absatz

Wir bauen ein SaaS für kleine bis mittlere Kommunikations- und PR-Agenturen im DACH-Raum. Kern-Produkt ist eine "Intake-Konsole", die eingehende Kunden-Nachrichten (E-Mail, WhatsApp, SharePoint) strukturiert klassifiziert, dem richtigen Menschen in der Agentur präsentiert, und bei sensitiven Vorgängen konsequent einen Menschen-Abzweig einbaut. Hinter der Konsole liegen sechs Backend-Handler (Presseanfragen-Drafter, Pressemitteilungs-Drafter, Monitoring-Digest, Journalisten-Intelligence, Terminbriefing, Multi-Channel-Transformer). Erster Pilot: MENSCH Kreativagentur München (Pharma/Healthcare-Boutique, 8 Angestellte).

Details siehe `SAAS_SPEC_v0.1_CONSOLE.md`.

---

## 2. Tech-Stack (verbindlich)

- **Frontend:** Next.js 15 App Router, TypeScript strict mode, Tailwind CSS
- **Backend:** Next.js API Routes plus Supabase Edge Functions
- **Datenbank:** Supabase (Postgres) mit Row-Level-Security für Mandantentrennung
- **Auth:** Supabase Auth
- **Storage:** Supabase Storage
- **Vector-Search:** Supabase pgvector für RAG in den Backend-Handlern
- **LLM-Provider:** primär Anthropic (Claude Sonnet, Opus, Haiku je nach Handler-Bedarf)
- **Deployment:** Hetzner-VPS mit Tailscale-VPN, Caddy als Reverse Proxy, GitHub Actions für CI/CD
- **Monitoring:** einfach starten mit Uptime-Robot plus Sentry, ausbauen wenn nötig

Abweichungen vom Stack brauchen einen Design-Decision-Eintrag (siehe §5) mit klarer Begründung.

---

## 3. Arbeitsdisziplin (nicht verhandelbar)

### 3.1 Main als einziger Integrationsbranch (temporär)

Kein Direkt-Commit auf `main`. Alle Änderungen laufen über PRs.

**Wichtig:** GitHub Branch-Protection ist auf diesem Repo technisch nicht durchgesetzt (persönliches Private-Repo ohne Team-Konto). Die Disziplin gilt als Konvention, nicht als technischer Zwang. Konkret:

- Kein direkter Push auf `main`. Niemals. Auch nicht "kurz für ein Typo-Fix".
- In der aktuellen Projektphase (vor produktivem Deployment) gehen alle PRs, inklusive aller Agent-PRs (claude-code-action), direkt gegen `main`. `main` ist bis auf Weiteres der einzige Integrationsbranch.

**Bewusst temporär:** Diese Vereinfachung gilt nur, solange kein produktives Deployment existiert. Der `stage`-Branch wird wieder eingeführt, sobald ein Auto-Deployment steht, das bei `main`-Merges Produktion aktualisiert (Zwei-Branch-Modell mit `stage` als Vor-Produktions-Umgebung, Releases als bewusste PRs von `stage` nach `main`). Bis dahin verursacht ein separater `stage`-Branch nur Reibung ohne Nutzen, weil es keine Umgebung gibt, auf die er deployt.

### 3.2 Konzept-vor-Code

Kein Feature wird gebaut, dessen Konzept nicht in `/docs/decisions/` als Markdown-Datei vorliegt. Format: `YYYY-MM-DD_kurztitel.md`. Struktur pro Entscheidung:

```markdown
# Titel

**Datum:** YYYY-MM-DD
**Status:** vorgeschlagen | akzeptiert | überholt
**Kontext:** was ist das Problem, das gelöst werden soll
**Optionen:** welche Alternativen wurden erwogen
**Entscheidung:** was wurde gewählt und warum
**Konsequenzen:** was ändert sich, was kann später schwierig werden
```

Neue Entscheidungen werden im PR mitgeliefert, wenn sie Auswirkungen aufs Produkt haben.

### 3.3 Test-Disziplin

- Jeder Handler hat mindestens 5 Referenz-Testfälle in `/tests/handlers/<slug>/`.
- Der Klassifikations-Layer hat mindestens 20 Referenz-Testfälle (positive und negative).
- Tests laufen in CI bei jedem PR.
- Tests testen Verhalten, nicht Implementation. Kein Snapshot-Testing für LLM-Outputs, weil die naturgemäß variieren.
- Schema-Validierung (Zod) für alle LLM-Outputs. Ein LLM-Output ohne Schema-Validierung ist kein produktiver Output.

### 3.4 Sprache und Ton in Code, Kommentaren, Commits

Code ist nicht pauschal englisch. Es gilt eine Trennung nach Domäne versus Gerüst:

- **Domänen-Bezeichner** (Datenbank-Tabellen, Domänen-Felder, Domänen-Typen): Deutsch, weil die Fachdomäne der DACH-PR-Beratung deutschsprachig ist. Beispiele: `vorgaenge`, `anliegen`, `kunden`, `sensitivity`, `kunden_kontakte`.
- **Technisches Gerüst** (Standard-Spalten, Framework-Code, Utility-Funktionen, generische Variablen): Englisch. Beispiele: `id`, `created_at`, `updated_at`, `deleted_at`, `status`, `agentur_id`.
- Faustregel: was ein PR-Berater als Fachbegriff kennt, ist Deutsch. Was ein Entwickler als technisches Standardelement kennt, ist Englisch.
- Doku und Kommentare: deutsch, weil der Zielmarkt DACH ist
- Commit-Messages: deutsch, im Präsens ("Fügt X hinzu", nicht "Added X")
- Keine em-dashes in Kommentaren oder Doku (Bastian-Präferenz)
- Keine ChatGPT-typische Phrasen wie "in der heutigen schnelllebigen Welt", "es ist wichtig zu betonen"

### 3.5 Umlaute

Deutsche Umlaute überall als echte Umlaute (ä, ö, ü, ß), nie als ae/oe/ue/ss. Sowohl in Prompts als auch in UI-Texten und in Doku.

---

## 4. Was NIE getan wird

Diese Liste ist absolut. Bei Verstößen ist der PR abzulehnen.

- **Keine Secrets im Code.** Keine API-Keys, keine Passwörter, keine Access-Tokens. Alle Secrets kommen aus Environment-Variablen. Vor jedem Commit läuft Gitleaks als Check.
- **Keine LLM-Aufrufe ohne Retry-Wrapper.** Rate-Limits sind erwartbar. Der Wrapper muss `Retry-After`-Header respektieren und auf `429`-in-Body-von-500-Antworten prüfen (Lehre aus dem bridgebound-Bug).
- **Kein Direct-Delete in der Datenbank.** Immer über Soft-Delete-Pattern mit `deleted_at`-Feld, außer im expliziten DSGVO-Löschungs-Prozess.
- **Keine Umgehung der Row-Level-Security.** Auch nicht "kurz für Debugging". RLS ist die Sicherheit.
- **Keine Klassifikations-Antwort ohne Schema-Validierung.** Jeder LLM-Output geht durch Zod, bevor er verwendet wird.
- **Keine Fake-Antworten ohne Menschen-Abzweig bei sensitiven Vorgängen.** Die Escalation-Hardrule aus Spec §3.3 ist unantastbar.
- **Keine Prompt-Erfindung.** Prompts, die produktiv verwendet werden, sind entweder aus den Specs übernommen oder in einer Design-Decision dokumentiert und begründet.
- **Kein Datentransfer außerhalb der EU** außer den notwendigen Anthropic-API-Calls und (falls in Betrieb) WhatsApp-Business-API-Calls. Beides in der AVV explizit aufgeführt.

---

## 5. Struktur des Repositories

```
/
├── AGENTS.md                              # diese Datei
├── SAAS_SPEC_v0.1_CONSOLE.md              # Kern-Produkt-Spec
├── WORKFLOW_HANDLERS_v0.1.md              # Handler-Kurz-Specs
├── BUILD_PLAN_v0.1.md                     # 8-Wochen-Plan
├── GESELLSCHAFT_UND_PILOT_v0.1.md         # Gesellschaft und Pilot
├── README.md                              # Übersicht plus Setup-Anleitung
├── docs/
│   ├── decisions/                         # Design-Decisions (siehe 3.2)
│   ├── handlers/                          # Detail-Specs pro Handler (sukzessive)
│   └── ops/                               # Betriebs-Runbooks
├── apps/
│   └── web/                               # Next.js-App
│       ├── src/
│       ├── tests/
│       └── package.json
├── packages/
│   ├── shared/                            # geteilte Types, Utils
│   ├── classifier/                        # Klassifikations-Layer
│   └── handlers/                          # die sechs Backend-Handler
├── supabase/
│   ├── migrations/                        # DB-Schema-Migrations
│   ├── functions/                         # Edge Functions
│   └── seed/                              # Test-Daten
├── .github/
│   └── workflows/                         # GitHub Actions CI/CD
└── infra/
    ├── caddy/                             # Caddy-Config-Vorlage
    └── deploy/                            # Deployment-Skripte für Hetzner
```

Diese Struktur ist Vorschlag, kann in einer Design-Decision angepasst werden, wenn eine bessere Alternative gefunden wird.

---

## 6. Wie Agent-Sessions ablaufen

### 6.1 Trigger

Ein Agent wird in der Regel durch eines dieser Ereignisse angestoßen:

- Ein neues GitHub-Issue mit dem Label `agent-task`
- Ein Kommentar `@claude bitte ...` an einem Issue oder einer PR
- Ein wöchentlicher Cron-Job für Maintenance (siehe `.github/workflows/weekly-maintenance.yml` wenn eingerichtet)

### 6.2 Ablauf pro Task

1. Lies AGENTS.md (diese Datei) und die vier Spec-Dokumente im Root.
2. Lies die Design-Decisions in `/docs/decisions/` chronologisch.
3. Falls die Task ein Feature betrifft, prüfe ob es in einer Design-Decision vor-diskutiert wurde. Falls nein: erstelle einen Vorschlag als Design-Decision und pausiere mit Rückfrage.
4. Arbeite in einem eigenen Branch, benannt nach dem Muster `agent/<kurze-beschreibung>-<datum>`.
5. Schreibe deinen Fortschritt in Commit-Messages, nicht in PR-Beschreibungen (leichter zu lesen).
6. Wenn du fertig bist: öffne eine PR auf `main` (siehe §3.1). In der PR-Beschreibung: was hast du gebaut, warum diese Wahl, was ist noch offen, wo würdest du gerne Feedback.
7. Warte auf Review, bevor du weiter machst.

### 6.3 Was tun bei Unsicherheit

- Wenn du unsicher bist ob eine Design-Entscheidung Bastian braucht: erstelle eine Design-Decision mit Status "vorgeschlagen" und pausiere.
- Wenn du unsicher bist ob eine Bibliothek in Frage kommt: recherchiere kurz, dokumentiere die Wahl in einem Kommentar, mach weiter. Falls die Wahl später zurückgezogen werden muss, ist der Aufwand klein.
- Wenn du auf einen Bug im bestehenden Code stößt der nicht zur Task gehört: dokumentiere ihn in einem separaten Issue, fixe ihn nicht im laufenden PR.

---

## 7. Klassifikations-Layer-Spezifika

Dieser Abschnitt ist detailreich, weil der Klassifikations-Layer das kritischste Modul ist.

### 7.1 Der Basis-Prompt

Der produktive Basis-Prompt ist im bestehenden Prototyp erprobt und ist die Grundlage. Er ist in `SAAS_SPEC_v0.1_CONSOLE.md` §3 dokumentiert. Änderungen am Basis-Prompt gehen immer über eine Design-Decision.

### 7.2 Modell-Wahl

- Klassifikation: Claude Sonnet-Klasse (aktuell 4.6 oder neuer)
- Backend-Handler:
  - W2, W1: Opus für Reasoning-schwere Passagen, Sonnet für Standard-Passagen
  - W3, W6: Sonnet reicht
  - W4, W5: Sonnet plus optional Haiku für Schnell-Recherchen
- Transkription: primär client-seitig via transformers.js (Xenova/whisper-tiny), Fallback OpenAI-Whisper-API

### 7.3 Token-Budgets

- Klassifikation: `max_tokens = 16000` (Denken frisst Tokens, siehe bridgebound-Lehre)
- Handler: pro Handler individuell, aber niemals unter 8000 wegen der Denken-vor-Antwort-Semantik
- Bei "Unexpected end of JSON input"-Fehlern: immer erst Token-Budget erhöhen, nicht auf andere Ursachen tippen

### 7.4 Retry-Semantik

Kanonisches Muster (aus bridgebound-Erfahrung):

```typescript
async function callLLMWithRetry<T>(fn: () => Promise<Response>, maxRetries = 6): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fn();
    const text = await res.text();
    if (isRateLimitResponse(res.status, text) && attempt < maxRetries) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 60000)
        : Math.min(3000 * Math.pow(2, attempt), 60000);
      await new Promise(r => setTimeout(r, backoff));
      continue;
    }
    if (!res.ok) throw new Error(`LLM ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as T;
  }
  throw new Error('Rate-Limit persistent nach 6 Retries');
}

function isRateLimitResponse(status: number, text: string): boolean {
  if (status === 429) return true;
  if (status === 500 && /API error:\s*429|rate_limited|Rate limit exceeded/i.test(text)) return true;
  return false;
}
```

Der 500-mit-eingebettetem-429-Fall ist echt und wurde in bridgebound gemessen.

---

## 8. DSGVO und Compliance-Reflexe

### 8.1 Grundregel

Wenn ein Feature personenbezogene Daten verarbeitet und du nicht sicher bist ob die DSGVO das erlaubt: pausiere und frage. Lieber ein Tag Verzögerung als ein Compliance-Vorfall.

### 8.2 EU-Hosting

Alle Betriebs-Systeme laufen in der EU. Datenverarbeitung außerhalb der EU nur für die notwendigen LLM-API-Calls an Anthropic (USA) und WhatsApp-Business-API-Calls an Meta (USA). Beides in der AVV explizit aufgeführt.

### 8.3 Löschfristen

Aus `SAAS_SPEC_v0.1_CONSOLE.md` §8.4 übernommen:

- Rohaudio nach Transkription: gelöscht binnen 5 Minuten
- Transkript-Inhalte: 24 Monate (konfigurierbar pro Agentur, minimum 6 Monate)
- Klassifikations-Metadaten: 5 Jahre, anonymisiert nach 24 Monaten
- Audit-Log: Vertragsdauer plus 3 Jahre

### 8.4 Löschprozess

Beim DSGVO-Löschungsverlangen einer betroffenen Person werden nicht die Nachrichten-Inhalte gelöscht (die bleiben für die Agentur-Dokumentation), sondern die Absender-Identität wird durch "gelöscht" ersetzt. Alle Vorgänge dieser Person sind danach anonym.

---

## 9. Pharma-Compliance-Erweiterung (für MENSCH-Pilot)

Weil der erste Pilot MENSCH Kreativagentur ist (Pharma/Healthcare-Spezialisierung), muss der Klassifikations-Layer um Compliance-Signale erweitert werden. Details siehe `GESELLSCHAFT_UND_PILOT_v0.1.md` §B.3.

Kern-Punkt: eine zusätzliche Sensitivity-Kategorie `regulatorisch_relevant`, die den Menschen-Abzweig auslöst, wenn:
- medizinische Wirkaussagen erwähnt werden
- off-label-Kommunikations-Signale vorkommen
- Fach- vs. Publikums-Kommunikations-Grenze berührt wird
- HWG-/AMG-/MDR-relevante Themen auftreten

Dieser Layer wird in den Wochen 3 und 4 gebaut, siehe `BUILD_PLAN_v0.1.md`.

---

## 10. Was in dieser Datei bewusst NICHT steht

- Konkrete API-Endpoint-Signaturen (kommen in Design-Decisions ab Woche 2)
- Konkrete DB-Schemas (in Migrations sichtbar)
- UI-Details (in Storybook-Stories oder Screenshots dokumentiert)
- Marketing- und Vertriebs-Strategie (nicht Aufgabe der Agenten)

---

## 11. Kontakt bei Grundsatzfragen

Für strategische oder produkt-strategische Fragen: Bastian Scherbeck (Repo-Owner). Nicht selbst entscheiden, sondern in einer Design-Decision zur Diskussion stellen.

Für technische Klärungen zu Handler-Verhalten oder Prompt-Feinschliff: erst die Specs, dann eine Design-Decision, dann fragen.

---

*Diese Datei ist die Version 1.0 der Grundinstruktion. Änderungen an ihr sind Meta-Änderungen und müssen mit Bastian abgestimmt werden.*
