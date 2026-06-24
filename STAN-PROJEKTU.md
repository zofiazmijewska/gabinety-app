# Stan projektu — Pracownia Psychoterapii Zofii Zmijewskiej
## Ostatnia aktualizacja: 24 czerwca 2026

---

## Struktura projektu

```
/Users/zofka/Claude/strona www/          <- root git repo
├── .git/
├── .gitignore
├── .claude/
│   ├── settings.json
│   └── launch.json                      <- dev server: python3 -m http.server 8234
├── CLAUDE.md                            <- zasady wspolpracy z AI
├── index.html                           <- strona glowna (wizytowka Pracowni)
├── hero-editor.html                     <- WYSIWYG do strojenia hero (drag&drop)
├── gabinety/
│   └── index.html                       <- aplikacja gabinetow (~5000 linii, monolityczny)
├── images/                              <- zdjecia strony
├── netlify/
│   └── functions/
│       ├── generate-invoices.js         <- Netlify Function do Fakturowni
│       └── extend-booking-series.js     <- Scheduled function (cron niedz. 03:00 UTC)
├── netlify.toml                         <- publish = ".", functions = "netlify/functions"
├── robots.txt
├── sitemap.xml
├── supabase-rls.sql                     <- DOKUMENTACJA (helper functions NIEWGRANE na prod)
├── booking-series-migration.sql         <- doc: tabela booking_series + RLS
├── partial-unique-constraint-migration.sql  <- doc: partial unique na single_bookings
├── fonts/
└── archiwum/                            <- stare pliki (w .gitignore)
```

## Deploy i hosting

- **GitHub repo:** github.com/zofiazmijewska/gabinety-app (public)
- **Branch `main`:** auto-deploy na Netlify
- **Branch `dev`:** do pracy (nie deployuje sie)
- **Netlify site:** elegant-sorbet-cbd9bc -> zofiazmijewska.pl (site ID: e2100bbf-8873-47fb-920f-c4d37a8ab239)
- **Publish dir:** `.` (root repo)
- **Domena:** zofiazmijewska.pl/ (strona), zofiazmijewska.pl/gabinety/ (app)

### Workflow git:
```bash
# Pracuj na dev:
git checkout dev
# ... zmiany ...
git add ... && git commit -m "opis"

# Deploy na produkcje:
git checkout main && git merge dev && git push && git checkout dev
```

## Supabase

- **Project ID:** clzfuvicdxewtovniriv
- **URL:** https://clzfuvicdxewtovniriv.supabase.co
- **Org:** galcqlclvlqkweyhtuqt — **DOSTĘPNY przez Supabase MCP** (apply_migration, execute_sql)
- **Auth:** email + password, RLS na wszystkich tabelach
- **Anon key:** publiczny (w gabinety/index.html), bezpieczenstwo przez RLS
- **UWAGA:** helper functions `is_admin()` / `my_tenant_id()` z supabase-rls.sql NIE są wgrane na prod. Polityki RLS używają inline subqueries — przy dodawaniu nowych polityk trzymaj się tego wzorca.

### Tabele:

**tenants** — najemcy
- id (UUID), name, email, phone, nip, company_name, address
- auth_user_id (UUID -> Supabase Auth)
- is_admin (bool), is_active (bool)
- monthly_fixed_amount (decimal), hourly_rate, single_hourly_rate
- wants_invoice (bool), fakturownia_client_id (int)

**rooms** — gabinety (3 sztuki: Gabinet 1, 2, 3)
- id, name, color

**single_bookings** — rezerwacje pojedyncze
- id, tenant_id, room_id, booking_date, start_time, end_time
- status (confirmed/cancelled), series_id (UUID — FK do booking_series.id dla nowych serii)
- created_by, cancelled_by, cancelled_at
- **Partial unique:** UNIQUE(room_id, booking_date, start_time) WHERE status='confirmed'
  (cancelled wpisy NIE blokują nowych rezerwacji na ten sam slot)

**fixed_bookings** — stale bloki (wynajem cykliczny)
- id, tenant_id, room_id, day_of_week (0=pon), start_time, end_time
- is_active (bool), valid_from (DATE), end_date (DATE — blok przestaje obowiązywać)

**fixed_booking_exceptions** — wyjatki od stalych blokow
- id, fixed_booking_id, exception_date, reason

**booking_series** — wzorce rezerwacji cyklicznych (od czerwca 2026)
- id (UUID), tenant_id, room_id, day_of_week, start_time, end_time
- auto_renew (bool — czy cron ma dostawiać kolejne tygodnie)
- is_active (bool — czy seria jest aktywna)
- created_by, created_at, last_extended_at, notes
- **Powiązanie:** single_bookings.series_id wskazuje na booking_series.id

**invoices** — faktury
- id, tenant_id, billing_month, fixed_amount, single_hours, single_amount
- total_amount, status (draft/sent), fakturownia_url

**audit_log** — historia zmian
- id, table_name, record_id, action, old_data (JSONB), new_data (JSONB)
- description, performed_by (UUID -> tenants), performed_at
- subject_tenant_id (UUID -> tenants) — czyja rezerwacja byla zmieniona
- RLS: admin widzi wszystko, najemca widzi swoje (performed_by LUB subject_tenant_id)

## Fakturowanie

- **Fakturownia.pl** konto: zzzmijewska.fakturownia.pl
- **Netlify Function** `generate-invoices.js` wysyla faktury do API
- **Zmienne srodowiskowe Netlify (potwierdzone 24.06.2026):**
  - FAKTUROWNIA_DOMAIN, FAKTUROWNIA_API_TOKEN, FAKTUROWNIA_DEPT_WYNAJEM, FAKTUROWNIA_PAYMENT_DAYS
  - SUPABASE_SERVICE_ROLE_KEY (ustawione 24.06.2026)
- **Logika:** faktura za maj = staly wynajem za maj (z gory) + godziny pojedyncze za kwiecien (z dolu)
- **Data na fakturze:** 1. dzien wybranego miesiaca (nie dzisiejsza!)
- **KSeF:** od 24.06.2026 faktury NIE są automatycznie wysyłane do KSeF (parametr `gov_save_and_send: false`). Trafiają do Fakturowni jako gotowe — Zofia ręcznie wysyła do KSeF po przeglądzie.

## Auto-przedłużanie serii cyklicznych (od czerwca 2026)

- **Tabela** `booking_series` przechowuje wzorzec (kto/gdzie/kiedy/auto_renew)
- **Przy tworzeniu rezerwacji cyklicznej:** wzorzec zapisuje się do booking_series; checkbox "Przedłużaj automatycznie" włącza auto_renew
- **Scheduled function** `extend-booking-series.js` — cron niedziela 03:00 UTC
  - Dla aktywnych serii z auto_renew=true dostawia rezerwacje do ~12 tygodni do przodu
  - Próg uruchomienia: <8 tygodni do końca
  - Pomija konflikty (inne rezerwacje, stałe bloki z end_date)
  - Wyłącza serie nieaktywnych najemców
- **Panel admina** zakładka "Serie cykliczne":
  - Lista wzorców (włącz/wyłącz auto, zatrzymaj, wznów)
  - Checkbox "pokaż nieaktywne"
- **Odwołaj tę i przyszłe** automatycznie wyłącza serię w booking_series

## Kalendarz

- **FullCalendar 6** z pluginem Scheduler (resource view)
- **Widok dnia:** `resourceTimeGridDay` — 3 kolumny gabinetow
- **Widok tygodnia:** `resourceTimeGridWeek` z `datesAboveResources: true` — dni jako naglowki, 3 podkolumny per dzien
- **Weekendy:** ukryte w tygodniu, widoczne w dniu
- **eventContent:** imie/nazwisko/(staly) na oddzielnych liniach, BEZ godzin
- **Kolory:** stale = jasniejsze tlo + bialy tekst, pojedyncze = ciemniejsze tlo
- **Fix:** w widoku listy (myCalendar) wymuszony ciemny tekst na wszystkich eventach
- **Pionowe linie miedzy dniami:** CSS ::before pseudo-element (nie znika przy hover)
- **Nagłówki gabinetow:** ukryte w widoku tygodnia (CSS display:none na .fc-resource-header)
- **Conflict check przy rezerwacji:** filtruje fixed_bookings po `valid_from` ORAZ `end_date` (od 23.06.2026; wcześniej nie filtrowało end_date i wygasłe bloki dawały fałszywe konflikty)

## Moje rezerwacje (panel najemcy)

- **myCalendar:** maly kalendarz z widokami miesiac/tydzien/lista
- **eventClick:** otwiera modal `openBookingDetail` z opcjami:
  - Zmien termin (data/godzina/gabinet)
  - Odwolaj te sesje (jednorazowo)
  - Odwolaj te i przyszle (cala seria od tej daty — wyłącza też booking_series.is_active)
- **bookingsCache:** cache danych rezerwacji do szybkiego dostepu z onclick

## Logowanie / Sesja

- **Supabase Auth** z onAuthStateChange:
  - SIGNED_IN: laduje profil, pokazuje app
  - TOKEN_REFRESHED: aktualizuje token bez przeladowania
  - SIGNED_OUT: sprawdza sesje zanim wyczyści stan (zabezpieczenie przed false signout)
- **visibilitychange:** po powrocie na karte sprawdza sesje
- **handleLogout:** czysci stan po signOut() bez czekania na event

## Strona główna (index.html)

- **Hero:** stała wysokość 700px (od 23.06.2026; wcześniej min-height: 90vh — twarz rosła na dużych monitorach)
- **hero-editor.html:** WYSIWYG do strojenia pozycji logo/przycisku (drag&drop + suwaki kadru Y i wysokości)
  - UWAGA: edytor używa pozycjonowania absolutnego, produkcja flexboxa — wartości pozycji nie da się wkleić 1:1

## Znane problemy i dług techniczny

1. **Monolityczny plik** — gabinety/index.html ma ~5000 linii, warto rozdzielic na moduły (CSS/JS/HTML)
2. **Brak automatycznych testow** — docelowo Playwright
3. **Logika biznesowa w kliencie** — walidacja powinna byc tez w RLS
4. **Brak error boundary** — bledy JS moga cicho zawieść
5. **FullCalendar license** — "Your license key is invalid" w konsoli
6. **RLS tenants zbyt permisywne** — `tenants_update` i `tenants_write` mają qual: true (każdy zalogowany może modyfikować każdego najemcę). Do uszczelnienia.

## W trakcie / nastepne kroki

### Wdrożone w czerwcu 2026:
- ✅ Auto-przedłużanie serii (booking_series + cron + panel admina)
- ✅ Backfill 7 starych serii do booking_series
- ✅ Partial unique constraint (cancelled nie blokują nowych rezerwacji)
- ✅ Fix conflict check dla wygasłych stałych bloków (end_date)
- ✅ KSeF: faktury nie wysyłane automatycznie
- ✅ Hero strony głównej — stała wysokość

### Pomysły na kolejne sesje:
- Automatyczne tworzenie konta Auth przy dodawaniu najemcy
- Podzial kodu gabinety/index.html na moduly
- Testy Playwright
- Audyt RLS policies (zwłaszcza tenants)
- Walidacja po stronie bazy (CHECK constraints, triggery)
