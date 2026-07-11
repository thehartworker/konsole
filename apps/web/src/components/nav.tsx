import Link from "next/link";

export function Nav() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/vorgaenge" className="text-sm font-semibold text-slate-900">
          Konsole
        </Link>
        <nav className="flex items-center gap-4 text-sm text-slate-600">
          <Link href="/vorgaenge" className="hover:text-slate-900">
            Vorgänge
          </Link>
          <Link href="/konto" className="hover:text-slate-900">
            Konto
          </Link>
          <form action="/logout" method="post">
            <button type="submit" className="hover:text-slate-900">
              Abmelden
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
