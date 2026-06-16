-- ============================================================
-- Migracja: partial unique na single_bookings
-- Status: ZASTOSOWANE 2026-06-16 via Supabase MCP (apply_migration)
-- ============================================================
--
-- Problem (znaleziony przy rezerwacjach Oksany):
-- Constraint `single_no_overlap` był UNIQUE(room_id, booking_date, start_time)
-- BEZ filtra na status. To znaczyło, że nawet ODWOŁANE (status='cancelled')
-- rezerwacje blokowały nowe wstawienia na ten sam slot.
--
-- Frontend próbował obejść to deletując cancelled przed insertem, ale:
--   1. Najemca nie ma polityki RLS DELETE na single_bookings → DELETE cicho zawodzi
--   2. Następnie INSERT pada z błędem 23505 (unique violation)
--   3. UI pokazuje "Termin zajęty w wybranym gabinecie" — co myli użytkowniczkę
--      bo termin NIE jest zajęty (tylko cancelled).
--
-- Rozwiązanie: partial unique index — constraint tylko gdy status='confirmed'.
-- Dzięki temu cancelled wpisy nie blokują nowych confirmed rezerwacji.
-- ============================================================

ALTER TABLE public.single_bookings
    DROP CONSTRAINT IF EXISTS single_no_overlap;

CREATE UNIQUE INDEX IF NOT EXISTS single_no_overlap_confirmed
    ON public.single_bookings (room_id, booking_date, start_time)
    WHERE status = 'confirmed';
