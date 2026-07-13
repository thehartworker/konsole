// @konsole/handlers: die Backend-Handler der Intake-Konsole (AGENTS.md §5).
// W2 ist der erste, referenz-gebende Handler (Issue #32), siehe
// docs/decisions/2026-07-12_w2-presseanfragen-drafter.md. W1 spiegelt das
// W2-Muster und nutzt zusätzlich das Kundenprofil, siehe
// docs/decisions/2026-07-13_w1-pressemitteilung-drafter.md.

export * from './w2/index.js';
export * from './w1/index.js';
