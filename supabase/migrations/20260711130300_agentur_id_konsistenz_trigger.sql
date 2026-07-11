-- agentur_id-Konsistenz-Trigger.
-- Quelle: docs/decisions/2026-07-10_datenmodell.md, "Konsequenzen":
-- "Ein Datenbank-Trigger, der das bei jedem Insert erzwingt (statt sich auf
-- Anwendungsdisziplin zu verlassen), ist ein sinnvoller Härtungs-Schritt für
-- die Migration." Dieser Trigger übernimmt agentur_id bei jedem Insert
-- unconditional aus der Parent-Zeile und überschreibt einen vom Aufrufer
-- mitgeschickten Wert. Das deckt sowohl "aus dem Parent übernehmen" als auch
-- "gegen Fälschung absichern" in einem Schritt ab, weil eine Fälschung erst
-- gar nicht übernommen werden kann.
--
-- Abweichung von der Decision: vorgaenge.agentur_id ist im Decision-Text
-- nicht explizit als "denormalisiert" markiert (anders als bei
-- kunden_kontakte, nutzer_kunden_zuweisungen, nutzer_vorgang_freigaben,
-- anliegen, handler_aufrufe). Sie ist aber über kunde_id -> kunden.agentur_id
-- ebenso ableitbar, und genau dieses Muster ist der Angriffsvektor, den die
-- Option-3-Begründung in der Decision beschreibt. Deshalb hier ebenfalls
-- geschützt, siehe PR-Beschreibung.
--
-- kunden.agentur_id und nutzer.agentur_id bekommen bewusst keinen Trigger:
-- beide sind die primäre Anbindung an eine Agentur, nicht von einer weiteren
-- bereits-agentur-gebundenen Parent-Zeile abgeleitet.

-- ============================================================
-- kunden_kontakte: agentur_id aus kunden (kunde_id) übernehmen
-- ============================================================

CREATE FUNCTION kunden_kontakte_agentur_id_setzen() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  SELECT agentur_id INTO STRICT NEW.agentur_id FROM kunden WHERE id = NEW.kunde_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER kunden_kontakte_agentur_id_setzen_trg
  BEFORE INSERT ON kunden_kontakte
  FOR EACH ROW EXECUTE FUNCTION kunden_kontakte_agentur_id_setzen();

-- ============================================================
-- vorgaenge: agentur_id aus kunden (kunde_id) übernehmen
-- ============================================================

CREATE FUNCTION vorgaenge_agentur_id_setzen() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  SELECT agentur_id INTO STRICT NEW.agentur_id FROM kunden WHERE id = NEW.kunde_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vorgaenge_agentur_id_setzen_trg
  BEFORE INSERT ON vorgaenge
  FOR EACH ROW EXECUTE FUNCTION vorgaenge_agentur_id_setzen();

-- ============================================================
-- nutzer_kunden_zuweisungen: agentur_id aus nutzer (nutzer_id) übernehmen
-- ============================================================

CREATE FUNCTION nutzer_kunden_zuweisungen_agentur_id_setzen() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  SELECT agentur_id INTO STRICT NEW.agentur_id FROM nutzer WHERE id = NEW.nutzer_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER nutzer_kunden_zuweisungen_agentur_id_setzen_trg
  BEFORE INSERT ON nutzer_kunden_zuweisungen
  FOR EACH ROW EXECUTE FUNCTION nutzer_kunden_zuweisungen_agentur_id_setzen();

-- ============================================================
-- nutzer_vorgang_freigaben: agentur_id aus vorgaenge (vorgang_id) übernehmen
-- ============================================================

CREATE FUNCTION nutzer_vorgang_freigaben_agentur_id_setzen() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  SELECT agentur_id INTO STRICT NEW.agentur_id FROM vorgaenge WHERE id = NEW.vorgang_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER nutzer_vorgang_freigaben_agentur_id_setzen_trg
  BEFORE INSERT ON nutzer_vorgang_freigaben
  FOR EACH ROW EXECUTE FUNCTION nutzer_vorgang_freigaben_agentur_id_setzen();

-- ============================================================
-- anliegen: agentur_id aus vorgaenge (vorgang_id) übernehmen
-- ============================================================

CREATE FUNCTION anliegen_agentur_id_setzen() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  SELECT agentur_id INTO STRICT NEW.agentur_id FROM vorgaenge WHERE id = NEW.vorgang_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER anliegen_agentur_id_setzen_trg
  BEFORE INSERT ON anliegen
  FOR EACH ROW EXECUTE FUNCTION anliegen_agentur_id_setzen();

-- ============================================================
-- handler_aufrufe: agentur_id UND kunde_id aus vorgaenge (vorgang_id)
-- übernehmen (beide Spalten sind laut Decision denormalisiert).
-- ============================================================

CREATE FUNCTION handler_aufrufe_agentur_id_setzen() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE
  parent vorgaenge%ROWTYPE;
BEGIN
  SELECT * INTO STRICT parent FROM vorgaenge WHERE id = NEW.vorgang_id;
  NEW.agentur_id := parent.agentur_id;
  NEW.kunde_id := parent.kunde_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER handler_aufrufe_agentur_id_setzen_trg
  BEFORE INSERT ON handler_aufrufe
  FOR EACH ROW EXECUTE FUNCTION handler_aufrufe_agentur_id_setzen();

-- ============================================================
-- audit_log: agentur_id aus vorgaenge (vorgang_id) übernehmen, nur wenn
-- vorgang_id gesetzt ist. Bei vorgangs-losen Einträgen (reiner Login-Zugriff
-- o.ä., siehe Decision) gibt es keine Parent-Zeile, aus der sich agentur_id
-- ableiten ließe; diese Einträge stammen ausschließlich aus
-- Service-Role-Pfaden (siehe rls-policies.md, "Konsequenzen").
-- ============================================================

CREATE FUNCTION audit_log_agentur_id_setzen() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  IF NEW.vorgang_id IS NOT NULL THEN
    SELECT agentur_id INTO STRICT NEW.agentur_id FROM vorgaenge WHERE id = NEW.vorgang_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_log_agentur_id_setzen_trg
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_agentur_id_setzen();
