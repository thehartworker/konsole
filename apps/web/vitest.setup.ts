import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// React Testing Library räumt bei Vitest den DOM zwischen Tests nicht
// automatisch auf (anders als bei Jest). Ohne dieses Setup akkumulieren
// gerenderte Komponenten im jsdom-Body, und Tests, die später in einer
// Datei laufen, sehen alle Kopien der früheren Renderings -- getByRole
// wirft dann "Found multiple elements". Siehe Issue #47 Aufgabe G.
afterEach(() => {
  cleanup();
});
