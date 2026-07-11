"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = formData.get("email");
  const passwort = formData.get("passwort");

  if (typeof email !== "string" || typeof passwort !== "string" || !email || !passwort) {
    redirect("/login?fehler=ungueltige-eingabe");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: passwort,
  });

  if (error) {
    redirect("/login?fehler=anmeldung-fehlgeschlagen");
  }

  redirect("/vorgaenge");
}
