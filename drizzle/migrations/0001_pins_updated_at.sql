CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER pins_touch BEFORE UPDATE ON public.pins FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();