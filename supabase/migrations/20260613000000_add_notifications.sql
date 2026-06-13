-- Migration: Add notifications and notification_reads tables

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  target_user_id uuid NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL    ON public.notifications TO service_role;

GRANT SELECT ON public.notification_reads TO authenticated;
GRANT ALL    ON public.notification_reads TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read notifications that are broadcast or addressed to them
DROP POLICY IF EXISTS notifications_public_read ON public.notifications;
CREATE POLICY notifications_public_read ON public.notifications
  FOR SELECT TO authenticated
  USING (target_user_id IS NULL OR target_user_id = auth.uid());

-- Policy: only service_role can insert notifications (admins should use server API)
REVOKE ALL ON public.notifications FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_wallet(uuid,numeric,payment_provider,text,text) TO service_role;

-- For notification_reads, allow users to insert a read row for themselves
DROP POLICY IF EXISTS notification_reads_insert ON public.notification_reads;
CREATE POLICY notification_reads_insert ON public.notification_reads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admin read access
DROP POLICY IF EXISTS notifications_admin_all ON public.notifications;
CREATE POLICY notifications_admin_all ON public.notifications
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS notification_reads_admin_all ON public.notification_reads;
CREATE POLICY notification_reads_admin_all ON public.notification_reads
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
