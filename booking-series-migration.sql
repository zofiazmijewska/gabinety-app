-- ============================================================
-- Migracja: booking_series (Etap 1 auto-przedłużania rezerwacji)
-- Status: ZASTOSOWANE 2026-05-31 via Supabase MCP (apply_migration)
-- ============================================================
--
-- Cel: zapisywać wzorzec rezerwacji cyklicznej (kto/gdzie/kiedy)
-- niezależnie od pojedynczych rekordów w single_bookings.
-- W Etapie 2 cron extend-booking-series dostawia kolejne tygodnie
-- dla serii oznaczonych auto_renew = true.
--
-- Powiązanie: single_bookings.series_id (UUID) wskazuje na
-- booking_series.id (dla nowych rezerwacji cyklicznych).
-- Stare rezerwacje sprzed migracji nie mają odpowiadającej serii
-- — i to OK, po prostu nie są auto-przedłużane.
--
-- UWAGA: polityki RLS używają inline subquery (NIE funkcji
-- is_admin() / my_tenant_id()) bo te helpery nigdy nie zostały
-- wgrane do produkcyjnej bazy. Stosujemy ten sam wzorzec co
-- istniejące polityki na single_bookings/fixed_bookings.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.booking_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Pon
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    auto_renew BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_extended_at TIMESTAMPTZ,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_booking_series_active_auto
    ON public.booking_series (auto_renew, is_active)
    WHERE auto_renew = true AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_booking_series_tenant
    ON public.booking_series (tenant_id);

ALTER TABLE public.booking_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "series_select_authenticated"
  ON public.booking_series FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "series_insert_own_or_admin"
  ON public.booking_series FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT id FROM public.tenants WHERE auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.tenants WHERE auth_user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "series_update_own_or_admin"
  ON public.booking_series FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT id FROM public.tenants WHERE auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.tenants WHERE auth_user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "series_delete_admin"
  ON public.booking_series FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tenants WHERE auth_user_id = auth.uid() AND is_admin = true)
  );
