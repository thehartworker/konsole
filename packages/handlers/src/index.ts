// Backend-Handler der Konsole (AGENTS.md §5). Ein Unterordner pro Handler
// unter src/, siehe docs/decisions/2026-07-12_w2-presseanfragen-drafter.md
// ("Zu 1") für die Struktur-Begründung. W2 ist der erste, das Referenz-Muster
// für W1/W3/... folgt derselben Aufteilung (kontext/prompt/draft/pruefung/
// export/handler pro Unterordner).

export * as w2 from './w2/index.js';
