import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Privilegierter Client für Storage-Zugriff auf den "kunden_quelldokumente"-
// Bucket (Issue #50, Aufgabe D): Upload/Download laufen bewusst über die
// Service-Role, nicht über die authentifizierte Session -- gleiches Muster
// wie in supabase/migrations/20260712120000_kunden_quelldokumente.sql und
// supabase/storage/kunden_quelldokumente_bucket.sql dokumentiert ("Upload
// läuft über eine Server-Route mit der Service-Role, kein direkter
// Endnutzer-Zugriff"). NUR serverseitig verwenden (Server-Actions), NIE mit
// NEXT_PUBLIC_-Präfix versehen oder im Client-Bundle referenzieren, siehe
// AGENTS.md §4 und apps/web/.env.example.
//
// Berechtigung, WER eine Extraktion für WELCHEN Kunden auslösen darf, wird
// weiterhin über den Session-Client geprüft, BEVOR dieser Client benutzt
// wird (siehe apps/web/src/app/kunden/[id]/profil/actions.ts) -- dieser
// Client selbst umgeht RLS vollständig und darf deshalb nie ungeprüft
// aufgerufen werden.
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("createServiceRoleClient: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY fehlen.");
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
