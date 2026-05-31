/**
 * Netlify Scheduled Function: extend-booking-series
 *
 * Uruchamia się co tydzień (niedziela 03:00 UTC = 04:00/05:00 Warsaw).
 *
 * Dla każdej serii w booking_series z auto_renew=true i is_active=true:
 *   1. Znajdź najpóźniejszą datę rezerwacji w tej serii (status nieistotny —
 *      chcemy wiedzieć dokąd seria sięga, nie czy dany dzień jest aktywny)
 *   2. Jeśli zostało < EXTEND_THRESHOLD tygodni do końca → dostaw nowe rezerwacje
 *      tak by zawsze było ~TARGET_WEEKS_AHEAD tygodni do przodu
 *   3. Pomijaj daty, na których jest już rezerwacja (status=confirmed) lub
 *      stały blok kolidujący czasowo
 *   4. Aktualizuj last_extended_at
 *
 * Jeśli najemca jest nieaktywny → zatrzymaj serię (is_active=false na serii).
 */

const TARGET_WEEKS_AHEAD = 12; // dążymy do tylu tygodni do przodu
const EXTEND_THRESHOLD   = 8;  // przedłużaj gdy zostało mniej niż tyle

exports.config = {
  schedule: '0 3 * * 0' // niedziela 03:00 UTC
};

exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://clzfuvicdxewtovniriv.supabase.co';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: 'Missing SUPABASE_SERVICE_ROLE_KEY' };
  }

  // Helper: woła REST API Supabase z service-role key (omija RLS)
  const sb = async (path, opts = {}) => {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
      ...opts,
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...(opts.headers || {})
      }
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Supabase ${opts.method || 'GET'} ${path}: ${resp.status} ${text}`);
    }
    // PATCH/DELETE z Prefer: return=representation może zwrócić pusty body
    const text = await resp.text();
    return text ? JSON.parse(text) : null;
  };

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  let processed = 0;
  let created   = 0;
  let conflicts = 0;
  let stopped   = 0;
  const log = [];

  try {
    // 1. Aktywne serie z auto_renew
    const series = await sb('/booking_series?auto_renew=eq.true&is_active=eq.true&select=*');
    log.push(`Found ${series.length} active auto-renew series`);

    for (const s of series) {
      processed++;
      const tag = `series ${s.id.substring(0, 8)}`;

      // 2. Najemca aktywny?
      const tenants = await sb(`/tenants?id=eq.${s.tenant_id}&select=is_active,single_hourly_rate,name`);
      if (!tenants[0]) {
        log.push(`${tag}: tenant not found, deactivating series`);
        await sb(`/booking_series?id=eq.${s.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_active: false })
        });
        stopped++;
        continue;
      }
      if (!tenants[0].is_active) {
        log.push(`${tag} (${tenants[0].name}): tenant inactive, deactivating series`);
        await sb(`/booking_series?id=eq.${s.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_active: false })
        });
        stopped++;
        continue;
      }
      const pricePerHour = tenants[0].single_hourly_rate || 100;

      // 3. Najpóźniejsza data w serii (każdy status — interesuje nas zasięg)
      const allInSeries = await sb(
        `/single_bookings?series_id=eq.${s.id}&select=booking_date&order=booking_date.desc&limit=1`
      );

      // Punkt startu: max(najpóźniejsza w serii, dzisiaj)
      let anchorDate;
      if (allInSeries.length === 0) {
        log.push(`${tag} (${tenants[0].name}): no bookings in series, anchoring to today`);
        anchorDate = new Date(todayStr + 'T00:00:00');
      } else {
        anchorDate = new Date(allInSeries[0].booking_date + 'T00:00:00');
        if (anchorDate < today) anchorDate = new Date(todayStr + 'T00:00:00');
      }

      // 4. Ile tygodni do przodu mamy?
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      const weeksAhead = Math.max(0, Math.floor((anchorDate - today) / msPerWeek));

      if (weeksAhead >= EXTEND_THRESHOLD) {
        log.push(`${tag} (${tenants[0].name}): ${weeksAhead} weeks ahead, no extension needed`);
        continue;
      }

      const weeksToAdd = TARGET_WEEKS_AHEAD - weeksAhead;
      log.push(`${tag} (${tenants[0].name}): ${weeksAhead}w ahead, adding ${weeksToAdd}w`);

      // 5. Rozbij start_time i end_time serii na godzinne sloty
      const startH = parseInt(s.start_time.split(':')[0], 10);
      const endH   = parseInt(s.end_time.split(':')[0], 10);

      // 6. Iteruj po tygodniach
      const newBookings = [];
      const skippedDates = [];

      for (let w = 1; w <= weeksToAdd; w++) {
        const d = new Date(anchorDate);
        d.setDate(d.getDate() + w * 7);
        const bDate = d.toISOString().split('T')[0];
        const dow = (d.getDay() + 6) % 7; // 0=pon

        // 6a. Konflikt: inna rezerwacja confirmed w tym samym pokoju/czasie
        // Overlap: start1 < end2 AND end1 > start2
        const existingConflicts = await sb(
          `/single_bookings?room_id=eq.${s.room_id}&booking_date=eq.${bDate}` +
          `&status=eq.confirmed&start_time=lt.${s.end_time}&end_time=gt.${s.start_time}` +
          `&series_id=neq.${s.id}&select=id,tenant_id`
        );
        if (existingConflicts.length > 0) {
          skippedDates.push(`${bDate}(other booking)`);
          conflicts++;
          continue;
        }

        // 6b. Konflikt ze stałym blokiem
        const fixedConflicts = await sb(
          `/fixed_bookings?room_id=eq.${s.room_id}&day_of_week=eq.${dow}` +
          `&is_active=eq.true&start_time=lt.${s.end_time}&end_time=gt.${s.start_time}` +
          `&select=id,end_date,valid_from`
        );
        const realConflict = fixedConflicts.find(f =>
          (!f.valid_from || f.valid_from <= bDate) &&
          (!f.end_date   || f.end_date   >  bDate)
        );
        if (realConflict) {
          skippedDates.push(`${bDate}(fixed block)`);
          conflicts++;
          continue;
        }

        // 6c. Usuń ewentualne odwołane na tym slocie (constraint by je zablokował)
        for (let h = startH; h < endH; h++) {
          const sTime = String(h).padStart(2, '0') + ':00:00';
          await sb(
            `/single_bookings?room_id=eq.${s.room_id}&booking_date=eq.${bDate}` +
            `&start_time=eq.${sTime}&status=eq.cancelled`,
            { method: 'DELETE' }
          );
        }

        // 6d. Dodaj rezerwacje godzinowe
        for (let h = startH; h < endH; h++) {
          newBookings.push({
            tenant_id:      s.tenant_id,
            room_id:        s.room_id,
            booking_date:   bDate,
            start_time:     String(h).padStart(2, '0') + ':00:00',
            end_time:       String(h + 1).padStart(2, '0') + ':00:00',
            price_per_hour: pricePerHour,
            status:         'confirmed',
            created_by:     s.created_by,
            series_id:      s.id
          });
        }
      }

      // 7. Wstaw nowe rezerwacje
      if (newBookings.length > 0) {
        await sb('/single_bookings', {
          method: 'POST',
          body: JSON.stringify(newBookings)
        });
        created += newBookings.length;
      }

      // 8. Aktualizuj last_extended_at
      await sb(`/booking_series?id=eq.${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ last_extended_at: new Date().toISOString() })
      });

      log.push(`${tag}: +${newBookings.length} bookings, ${skippedDates.length} skipped ${skippedDates.length ? '[' + skippedDates.join(', ') + ']' : ''}`);
    }

    const summary = {
      timestamp: new Date().toISOString(),
      seriesProcessed: processed,
      bookingsCreated: created,
      conflictsSkipped: conflicts,
      seriesStopped: stopped,
      log
    };
    console.log('extend-booking-series:', JSON.stringify(summary, null, 2));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summary, null, 2)
    };
  } catch (e) {
    console.error('extend-booking-series error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message, log })
    };
  }
};
