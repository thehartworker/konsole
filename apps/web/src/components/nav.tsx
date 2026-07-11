import Link from "next/link";

export function Nav({ aktiv }: { aktiv: "vorgaenge" | "konto" }) {
  const linkKlasse = (ziel: typeof aktiv) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      ziel === aktiv
        ? "bg-slate-900 text-white"
        : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">Konsole</span>
          <nav className="flex items-center gap-1">
            <Link href="/vorgaenge" className={linkKlasse("vorgaenge")}>
              Vorgänge
            </Link>
            <Link href="/konto" className={linkKlasse("konto")}>
              Konto
            </Link>
          </nav>
        </div>

        <form action="/logout" method="post">
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Abmelden
          </button>
        </form>
      </div>
    </header>
  );
}
