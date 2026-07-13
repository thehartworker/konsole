// White-Label-Vorbereitung (Issue #43): eine einzige Stelle für
// markenbezogene Werte. In v1 gibt es nur DEFAULT_THEME (ein neutrales
// Standard-Theme, kein Kunden-Branding). Die Architektur ist bewusst so
// geschnitten, dass ein späterer Block AgenturTheme pro Agentur aus der DB
// laden kann (agenturen.name existiert bereits, Primär-/Akzentfarbe und
// Logo-URL wären zusätzliche Spalten), ohne dass Komponenten sich ändern
// müssen -- sie kennen nur die CSS-Custom-Properties aus globals.css, nie
// diese Werte direkt. Siehe
// docs/decisions/2026-07-13_konsole-block1-vorgangs-detailansicht.md,
// Abschnitt 2.

export interface AgenturTheme {
  agenturName: string;
  primaerfarbe: string;
  primaerfarbeHover: string;
  akzentfarbe: string;
  logoUrl: string | null;
}

export const DEFAULT_THEME: AgenturTheme = {
  agenturName: "Konsole",
  primaerfarbe: "#1e3a5f",
  primaerfarbeHover: "#16293f",
  akzentfarbe: "#0f766e",
  logoUrl: null,
};

/** Für <html style={...}>: überschreibt die :root-Defaults aus globals.css. */
export function themeAlsCssVariablen(theme: AgenturTheme): Record<string, string> {
  return {
    "--color-primary": theme.primaerfarbe,
    "--color-primary-hover": theme.primaerfarbeHover,
    "--color-accent": theme.akzentfarbe,
  };
}
