# Deployment-Strategie

**Datum:** 2026-07-10
**Status:** vorgeschlagen

**Kontext:** Für den produktiven Betrieb eines Multi-Tenant-SaaS mit DSGVO-Anforderungen (EU-Hosting, siehe `SAAS_SPEC_v0.1_CONSOLE.md` §8.3) braucht es eine Deployment-Strategie für Application-Server, Datenbank und Objekt-Storage. Die Gesellschaft befindet sich in der Bootstrapping-Phase, Kostenkontrolle ist daher wichtig, ebenso Betriebs-Einfachheit für ein kleines Team.

**Optionen:**

1. Hetzner-VPS mit eigenem Setup (Tailscale-VPN, Caddy als Reverse Proxy, GitHub Actions für CI/CD).
2. Vercel (natives Next.js-Hosting).
3. Railway.
4. Fly.io.

**Entscheidung:** Option 1, Hetzner-VPS (Falkenstein oder Nürnberg) mit Tailscale-VPN für internen Zugriff auf Verwaltungs-Schnittstellen, Caddy als Reverse Proxy mit automatischem TLS, und GitHub Actions für CI/CD-Deployment.

**Begründung:**

- EU-Hosting ist Pflicht (`SAAS_SPEC_v0.1_CONSOLE.md` §8.3), Hetzner ist dort bereits als empfohlener Anbieter genannt, unter anderem weil Bastian dort bestehende Erfahrung und Infrastruktur hat. Das reduziert die Lernkurve gegenüber einem komplett neuen Anbieter.
- Kostenkontrolle: ein Hetzner-VPS mit vorhersehbarer Grundlast ist über die Pilot- und frühe Wachstumsphase deutlich günstiger als Vercel oder Railway, deren Preismodelle bei Function-Aufrufen und Bandbreite schneller skalieren.
- Tailscale-VPN kapselt administrative Schnittstellen (Datenbank-Zugriff, Deploy-Hooks) hinter einem privaten Netz, statt sie öffentlich zu exponieren. Das ist ein einfacher, gut dokumentierter Baustein ohne zusätzlichen Betriebsaufwand.
- Vercel (Option 2) wurde verworfen, weil lang laufende Hintergrundprozesse (Handler-Queue-Worker mit Timeout-Semantik aus `SAAS_SPEC_v0.1_CONSOLE.md` §12.3) auf dem Serverless-Modell schlechter abgebildet werden können als auf einem dauerhaft laufenden Prozess, und weil die genaue Region-Zusicherung für alle verarbeiteten Daten (nicht nur den Edge-Cache) zusätzlich geprüft werden müsste.
- Railway (Option 3) wurde verworfen, weil die Auswahl an EU-Rechenzentren eingeschränkter ist, die Kosten bei Dauerlast ähnlich wie bei Vercel steigen, und das Networking-Modell weniger Kontrolle für ein VPN-Pattern wie mit Tailscale bietet.
- Fly.io (Option 4) wurde verworfen, weil es zwar EU-Regionen anbietet, aber kein bestehendes Betriebs-Wissen im Team vorhanden ist und kein klarer Vorteil gegenüber Hetzner für diesen Anwendungsfall erkennbar ist.

**Konsequenzen:**

- Das Team übernimmt volle Verantwortung für Server-Patching, Betriebssystem-Updates und Monitoring (Uptime-Robot plus Sentry, siehe `AGENTS.md` §2), es gibt keine von einer Plattform automatisch verwaltete Infrastruktur.
- Kein automatisches horizontales Scaling wie bei einer PaaS-Lösung. Bei Wachstum müssen weitere Hetzner-Instanzen manuell ergänzt und ins Setup integriert werden.
- Die GitHub-Actions-Pipeline benötigt SSH-Zugriff auf den Server für Deployments, entsprechende Secrets müssen über GitHub Actions Secrets verwaltet werden, nie im Code (`AGENTS.md` §4).
- Konkrete Server-Größe, Anzahl der Instanzen und genaues Caddy-Routing für Multi-Tenant-Subdomains (`konsole.<agentur-domain>` versus Subdomain unter der SaaS-Domain, siehe `SAAS_SPEC_v0.1_CONSOLE.md` §11.1) sind noch nicht im Detail festgelegt und folgen in einer separaten Konzept-Runde vor dem Produktions-Deployment in Woche 7.
