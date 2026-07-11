import { login } from "./actions";

const FEHLERTEXTE: Record<string, string> = {
  "ungueltige-eingabe": "Bitte E-Mail und Passwort eingeben.",
  "anmeldung-fehlgeschlagen": "E-Mail oder Passwort ist falsch.",
};

export default async function LoginSeite({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string }>;
}) {
  const { fehler } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Anmelden</h1>
          <p className="mt-1 text-sm text-slate-500">Intake-Konsole</p>
        </div>

        {fehler ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {FEHLERTEXTE[fehler] ?? "Anmeldung fehlgeschlagen."}
          </p>
        ) : null}

        <form action={login} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              E-Mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="passwort" className="block text-sm font-medium text-slate-700">
              Passwort
            </label>
            <input
              id="passwort"
              name="passwort"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Anmelden
          </button>
        </form>
      </div>
    </main>
  );
}
