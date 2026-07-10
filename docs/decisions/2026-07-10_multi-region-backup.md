# Multi-Region-Backup-Strategie

**Datum:** 2026-07-10
**Status:** vorgeschlagen

**Kontext:** DSGVO Art. 32 verlangt technische und organisatorische Maßnahmen, die im Falle eines physischen oder technischen Zwischenfalls die Verfügbarkeit und den Zugang zu personenbezogenen Daten rasch wiederherstellen können. `SAAS_SPEC_v0.1_CONSOLE.md` §12.5 gibt dafür bereits ein konkretes Ziel vor (RPO 24 Stunden, RTO 4 Stunden), diese Entscheidung dokumentiert die zugrunde liegende Architektur-Wahl.

**Optionen:**

1. Single-Region mit Snapshots: tägliche Snapshots des primären Hetzner-Standorts, gespeichert beim selben Anbieter am selben Standort.
2. Multi-Region mit täglichem Sync: tägliche verschlüsselte Snapshots, übertragen in ein zweites EU-Rechenzentrum, idealerweise eines anderen Anbieters als das primäre System.

**Entscheidung:** Option 2, Multi-Region-Backup mit täglichem verschlüsseltem Sync in ein zweites EU-Rechenzentrum eines anderen Anbieters als der primäre Hetzner-Standort. Ziel-Werte: Restore-Point-Objective 24 Stunden, Restore-Time-Objective 4 Stunden für kritische Systeme, wie in `SAAS_SPEC_v0.1_CONSOLE.md` §12.5 vorgegeben.

**Begründung:**

- Single-Region-Snapshots (Option 1) schützen gegen versehentliches Löschen oder Datenkorruption, aber nicht gegen einen vollständigen Ausfall des primären Anbieters, etwa durch einen Rechenzentrumsbrand, eine regionale Störung, oder eine Anbieter-seitige Insolvenz. Für ein Produkt, das Kommunikationsdaten von Agentur-Kunden verarbeitet, ist dieses Restrisiko zu hoch.
- Ein zweiter Anbieter statt einer zweiten Hetzner-Region reduziert das Korrelationsrisiko bei anbieterweiten Vorfällen (Netzwerk-Ausfall, Sicherheitsvorfall beim Anbieter selbst), die eine einzelne Region desselben Anbieters nicht abfängt.
- RPO 24 Stunden und RTO 4 Stunden sind bewusst moderate Ziele, kein Hot-Standby und kein Zero-Downtime-Failover. Das passt zum Reifegrad einer neu gegründeten Gesellschaft in der Pilot-Phase und vermeidet unnötige Betriebskomplexität, solange das Vorgangs-Volumen klein ist.
- Tägliche Snapshots plus Verschlüsselung vor der Übertragung erfüllen die DSGVO-Anforderung an technische Maßnahmen, ohne ein aufwändiges Kontinuierliches-Replikations-Setup zu benötigen, das für die aktuelle Betriebsgröße nicht gerechtfertigt wäre.

**Konsequenzen:**

- Zusätzlicher Betriebsaufwand für Snapshot-Verschlüsselung und die Cross-Provider-Übertragung, muss im Deployment-Setup (`docs/decisions/2026-07-10_deployment.md`) und in einem Betriebs-Runbook unter `docs/ops/` abgebildet werden.
- Zusätzliche Storage-Kosten beim zweiten Anbieter, relevant für das Kosten-Modell, das laut `SAAS_SPEC_v0.1_CONSOLE.md` Anhang B erst in einer späteren Woche im Detail ausgearbeitet wird.
- Der Restore-Prozess muss dokumentiert und mindestens einmal vor dem Produktions-Start getestet werden, nicht erst im tatsächlichen Vorfall.
- Offener Punkt für Bastian: der konkrete zweite Anbieter ist noch nicht festgelegt. Kandidaten aus `SAAS_SPEC_v0.1_CONSOLE.md` §8.3 wären AWS Frankfurt, Google Cloud Frankfurt oder Azure Frankfurt, jeweils als EU-Standort mit anderem Betreiber als Hetzner.
