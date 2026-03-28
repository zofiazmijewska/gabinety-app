-- ============================================================
-- RLS (Row Level Security) dla projektu Gabinety
-- Uruchom w Supabase SQL Editor
-- ============================================================

-- 1. FUNKCJE POMOCNICZE
-- ============================================================

-- Sprawdza czy aktualny użytkownik jest adminem
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE auth_user_id = auth.uid()
    AND is_admin = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Zwraca tenant_id aktualnego użytkownika
CREATE OR REPLACE FUNCTION public.my_tenant_id()
RETURNS uuid AS $$
  SELECT id FROM public.tenants
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- 2. WŁĄCZ RLS NA WSZYSTKICH TABELACH
-- ============================================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.single_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_booking_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;


-- 3. POLITYKI DLA TABELI: tenants
-- ============================================================
-- SELECT: zalogowani widzą wszystkich (potrzebne do kalendarza — wyświetla imiona)
-- INSERT/UPDATE/DELETE: tylko admin

CREATE POLICY "tenants_select_authenticated"
  ON public.tenants FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "tenants_insert_admin"
  ON public.tenants FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "tenants_update_own_or_admin"
  ON public.tenants FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid() OR public.is_admin());

CREATE POLICY "tenants_delete_admin"
  ON public.tenants FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- 4. POLITYKI DLA TABELI: rooms
-- ============================================================
-- SELECT: wszyscy zalogowani
-- INSERT/UPDATE/DELETE: tylko admin

CREATE POLICY "rooms_select_authenticated"
  ON public.rooms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "rooms_modify_admin"
  ON public.rooms FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- 5. POLITYKI DLA TABELI: single_bookings
-- ============================================================
-- SELECT: wszyscy zalogowani (kalendarz pokazuje wszystkie rezerwacje)
-- INSERT: własne rezerwacje + admin dla kogokolwiek
-- UPDATE/DELETE: własne + admin

CREATE POLICY "bookings_select_authenticated"
  ON public.single_bookings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "bookings_insert_own_or_admin"
  ON public.single_bookings FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.my_tenant_id() OR public.is_admin());

CREATE POLICY "bookings_update_own_or_admin"
  ON public.single_bookings FOR UPDATE
  TO authenticated
  USING (tenant_id = public.my_tenant_id() OR public.is_admin());

CREATE POLICY "bookings_delete_admin"
  ON public.single_bookings FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- 6. POLITYKI DLA TABELI: fixed_bookings
-- ============================================================
-- SELECT: wszyscy zalogowani (kalendarz)
-- INSERT/UPDATE/DELETE: tylko admin

CREATE POLICY "fixed_select_authenticated"
  ON public.fixed_bookings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "fixed_insert_admin"
  ON public.fixed_bookings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "fixed_update_admin"
  ON public.fixed_bookings FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "fixed_delete_admin"
  ON public.fixed_bookings FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- 7. POLITYKI DLA TABELI: fixed_booking_exceptions
-- ============================================================
-- SELECT: wszyscy zalogowani
-- INSERT: własne (odwołanie stałej rez.) + admin
-- DELETE: admin

CREATE POLICY "exceptions_select_authenticated"
  ON public.fixed_booking_exceptions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "exceptions_insert_own_or_admin"
  ON public.fixed_booking_exceptions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.fixed_bookings fb
      WHERE fb.id = fixed_booking_id
      AND fb.tenant_id = public.my_tenant_id()
    )
  );

CREATE POLICY "exceptions_delete_admin"
  ON public.fixed_booking_exceptions FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- 8. POLITYKI DLA TABELI: rental_terms
-- ============================================================
-- SELECT: własne + admin
-- INSERT/UPDATE/DELETE: admin

CREATE POLICY "rental_terms_select_own_or_admin"
  ON public.rental_terms FOR SELECT
  TO authenticated
  USING (tenant_id = public.my_tenant_id() OR public.is_admin());

CREATE POLICY "rental_terms_modify_admin"
  ON public.rental_terms FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- 9. POLITYKI DLA TABELI: rental_history
-- ============================================================
-- SELECT: własne + admin
-- INSERT/UPDATE/DELETE: admin

CREATE POLICY "rental_history_select_own_or_admin"
  ON public.rental_history FOR SELECT
  TO authenticated
  USING (tenant_id = public.my_tenant_id() OR public.is_admin());

CREATE POLICY "rental_history_modify_admin"
  ON public.rental_history FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- 10. POLITYKI DLA TABELI: invoices
-- ============================================================
-- SELECT: własne + admin
-- INSERT/UPDATE/DELETE: admin

CREATE POLICY "invoices_select_own_or_admin"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (tenant_id = public.my_tenant_id() OR public.is_admin());

CREATE POLICY "invoices_insert_admin"
  ON public.invoices FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "invoices_update_admin"
  ON public.invoices FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "invoices_delete_admin"
  ON public.invoices FOR DELETE
  TO authenticated
  USING (public.is_admin());
