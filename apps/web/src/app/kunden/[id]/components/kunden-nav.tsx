"use client";

// Tab-Leiste für den Kunden-Detail-Container (Issue #52, Aufgabe D erweitert
// das bisher statische "Profil"-Tab aus Issue #50 um "Mail-Anbindung").

import Link from "next/link";
import { usePathname } from "next/navigation";

export function KundenNav({ kundeId }: { kundeId: string }) {
  const pathname = usePathname();

  const tabs = [
    { href: `/kunden/${kundeId}/profil`, label: "Profil" },
    { href: `/kunden/${kundeId}/mail-anbindung`, label: "Mail-Anbindung" },
  ];

  return (
    <nav aria-label="Kunden-Bereiche" className="mt-4 flex gap-4 border-b border-border text-sm">
      {tabs.map((tab) => {
        const aktiv = pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={aktiv ? "page" : undefined}
            className={
              aktiv
                ? "border-b-2 border-primary px-1 pb-2 font-medium text-ink"
                : "border-b-2 border-transparent px-1 pb-2 text-ink-muted hover:text-ink"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
