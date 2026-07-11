-- Nutzer-Verknuepfung: automatische nutzer-Zeile bei auth.users-Anlage.
-- Quelle: docs/decisions/2026-07-11_basis-auth.md
--
-- current_agentur_id()/current_rolle() (Migration
-- 20260711130200_helper_funktionen_und_rls.sql) lesen live aus der
-- nutzer-Tabelle ueber auth.uid(). Dieser Trigger stellt sicher, dass jede
-- auth.users-Zeile strukturell (nicht nur per Anwendungsdisziplin) eine
-- passende nutzer-Zeile bekommt, sobald sie angelegt wird. Fail-closed: ohne
-- agentur_id/rolle in user_metadata schlaegt der komplette Insert fehl,
-- siehe Decision fuer die Begruendung gegen einen halb-provisionierten
-- Nutzer ohne Agentur-Bindung.

CREATE FUNCTION handle_new_user() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF NEW.raw_user_meta_data ->> 'agentur_id' IS NULL
     OR NEW.raw_user_meta_data ->> 'rolle' IS NULL THEN
    RAISE EXCEPTION
      'auth.users-Anlage ohne agentur_id/rolle in user_metadata ist nicht erlaubt (nutzer-Verknuepfung, siehe docs/decisions/2026-07-11_basis-auth.md)';
  END IF;

  INSERT INTO nutzer (id, agentur_id, name, rolle, guest_ablauf_at)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data ->> 'agentur_id')::uuid,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    (NEW.raw_user_meta_data ->> 'rolle')::rolle,
    NULLIF(NEW.raw_user_meta_data ->> 'guest_ablauf_at', '')::timestamptz
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION handle_new_user() IS
  'SECURITY DEFINER, weil der Trigger waehrend eines Inserts in auth.users '
  'laeuft und in public.nutzer schreiben muss. Kein Parameter-Durchgriff: '
  'einzige Eingabe ist die NEW-Zeile aus auth.users, gesetzt von GoTrue '
  '(Supabase Auth), nicht vom Aufrufer einer RLS-geschuetzten Route.';

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
