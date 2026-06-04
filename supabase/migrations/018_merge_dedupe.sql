-- Migration 018: Merge functions for de-duplicating companies & contacts.
-- Reassign every reference from the duplicate to the kept record, then delete
-- the duplicate. Transactional + SECURITY DEFINER so all FKs move atomically.

CREATE OR REPLACE FUNCTION public.merge_companies(keep_id uuid, dup_id uuid)
RETURNS void AS $$
BEGIN
  IF public.current_user_role() NOT IN ('editor','owner') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF keep_id = dup_id THEN RAISE EXCEPTION 'Cannot merge a record into itself'; END IF;

  UPDATE public.locations        SET company_id = keep_id WHERE company_id = dup_id;
  UPDATE public.deals            SET company_id = keep_id WHERE company_id = dup_id;
  UPDATE public.tickets          SET company_id = keep_id WHERE company_id = dup_id;
  UPDATE public.onboardings      SET company_id = keep_id WHERE company_id = dup_id;
  UPDATE public.leads            SET company_id = keep_id WHERE company_id = dup_id;
  UPDATE public.form_submissions SET created_company_id = keep_id WHERE created_company_id = dup_id;
  UPDATE public.associations     SET from_id = keep_id WHERE from_type = 'company' AND from_id = dup_id;
  UPDATE public.associations     SET to_id   = keep_id WHERE to_type   = 'company' AND to_id   = dup_id;
  UPDATE public.crm_projects     SET subject_id = keep_id WHERE subject_type = 'company' AND subject_id = dup_id;

  DELETE FROM public.companies WHERE id = dup_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.merge_contacts(keep_id uuid, dup_id uuid)
RETURNS void AS $$
BEGIN
  IF public.current_user_role() NOT IN ('editor','owner') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF keep_id = dup_id THEN RAISE EXCEPTION 'Cannot merge a record into itself'; END IF;

  UPDATE public.tickets          SET contact_id = keep_id WHERE contact_id = dup_id;
  UPDATE public.leads            SET contact_id = keep_id WHERE contact_id = dup_id;
  UPDATE public.crm_activities   SET contact_id = keep_id WHERE contact_id = dup_id;
  UPDATE public.form_submissions SET created_contact_id = keep_id WHERE created_contact_id = dup_id;
  UPDATE public.feature_requests SET requested_by = keep_id WHERE requested_by = dup_id;
  UPDATE public.associations     SET from_id = keep_id WHERE from_type = 'contact' AND from_id = dup_id;
  UPDATE public.associations     SET to_id   = keep_id WHERE to_type   = 'contact' AND to_id   = dup_id;

  DELETE FROM public.contacts WHERE id = dup_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.merge_companies(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_contacts(uuid, uuid) TO authenticated;
