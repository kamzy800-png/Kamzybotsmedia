-- ============================================================
-- Migration 001 — User-callable credential claim function
-- Allows authenticated users to claim credentials on their
-- own orders without needing the service_role key.
-- ============================================================

-- user_claim_credential:
--   Authenticated users can call this with their own JWT.
--   SECURITY DEFINER so it can bypass RLS to lock the credential row,
--   but it verifies ownership before doing anything.
CREATE OR REPLACE FUNCTION public.user_claim_credential(
  _order_id  uuid,
  _product_id uuid
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_order_user_id uuid;
  v_cred_id       uuid;
  v_content       text;
  v_label         text;
BEGIN
  -- Ownership check
  SELECT user_id INTO v_order_user_id FROM public.orders WHERE id = _order_id;
  IF v_order_user_id IS NULL THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- Already delivered? look up any credential linked to this order+product
  SELECT id, content, label INTO v_cred_id, v_content, v_label
    FROM public.product_credentials
    WHERE order_id = _order_id AND product_id = _product_id
    LIMIT 1;

  IF v_cred_id IS NOT NULL THEN
    RETURN jsonb_build_object('assigned', true, 'content', v_content, 'label', v_label);
  END IF;

  -- Claim the next available credential (SKIP LOCKED = no two buyers get same row)
  SELECT id INTO v_cred_id
    FROM public.product_credentials
    WHERE product_id = _product_id AND order_id IS NULL
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

  IF v_cred_id IS NULL THEN
    RETURN jsonb_build_object('assigned', false, 'content', null, 'label', null);
  END IF;

  UPDATE public.product_credentials
    SET order_id     = _order_id,
        assigned_to  = auth.uid(),
        delivered_at = now()
    WHERE id = v_cred_id;

  SELECT content, label INTO v_content, v_label
    FROM public.product_credentials WHERE id = v_cred_id;

  UPDATE public.order_items
    SET delivered_payload = v_content
    WHERE order_id = _order_id AND product_id = _product_id;

  RETURN jsonb_build_object('assigned', true, 'content', v_content, 'label', v_label);
END;
$$;

REVOKE ALL ON FUNCTION public.user_claim_credential(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.user_claim_credential(uuid, uuid) TO authenticated;
