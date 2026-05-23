# Stan projektu — Pracownia Psychoterapii Zofii Zmijewskiej
## Ostatnia aktualizacja: 30 kwietnia 2026

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
├── gabinety/
│   └── index.html                       <- aplikacja gabinetow (~4800 linii, monolityczny)
├── images/                              <- zdjecia strony
├── netlify/
│   └── functions/
│       └── generate-invoices.js         <- Netlify Function do Fakturowni
├── netlify.toml                         <- publish = ".", functions = "netlify/functions"
├── robots.txt
├── sitemap.xml
├── supabase-rls.sql
├── fonts/
└── archiwum/                            <- stare pliki (w .gitignore)
```

## Deploy i hosting

- **GitHub repo:** github.com/zofiazmijewska/gabinety-app (public)
- **Branch `main`:** auto-deploy na Netlify
- **Branch `dev`:** do pracy (nie deployuje sie)
- **Netlify site:** elegant-sorbet-cbd9bc -> zofiazmijewska.pl
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
- **Org:** galcqlclvlqkweyhtuqt (NIE jest na liscie Supabase MCP — trzeba uzywac SQL Editor w Chrome)
- **Auth:** email + password, RLS na wszystkich tabelach
- **Anon key:** publiczny (w gabinety/index.html), bezpieczenstwo przez RLS

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
- status (confirmed/cancelled), series_id (UUID — lacznik serii)
- created_by, cancelled_by, cancelled_at

**fixed_bookings** — stale bloki (wynajem cykliczny)
- id, tenant_id, room_id, day_of_week (0=pon), start_time, end_time
- is_active (bool), valid_from (DATE — blok nie pojawia sie przed ta data)

**fixed_booking_exceptions** — wyjatki od stalych blokow
- id, fixed_booking_id, exception_date, reason

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
- **Zmienne srodowiskowe Netlify:** FAKTUROWNIA_DOMAIN, FAKTUROWNIA_API_TOKEN, FAKTUROWNIA_DEPT_WYNAJEM, SUPABASE_SERVICE_ROLE_KEY
- **Logika:** faktura za maj = staly wynajem za maj (z gory) + godziny pojedyncze za kwiecien (z dolu)
- **Data na fakturze:** 1. dzien wybranego miesiaca (nie dzisiejsza!)
- **PROBLEM (30.04.2026):** faktury za maj maja status `draft` mimo ze fakturownia_client_id sa wypelnione. Trzeba sprawdzic logi Netlify function — moze cos z tokenem lub zmiennymi srodowiskowymi.

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

## Moje rezerwacje (panel najemcy)

- **myCalendar:** maly kalendarz z widokami miesiac/tydzien/lista
- **eventClick:** otwiera modal `openBookingDetail` z opcjami:
  - Zmien termin (data/godzina/gabinet)
  - Odwolaj te sesje (jednorazowo)
  - Odwolaj te i przyszle (cala seria od tej daty)
- **bookingsCache:** cache danych rezerwacji do szybkiego dostepu z onclick

## Logowanie / Sesja

- **Supabase Auth** z onAuthStateChange:
  - SIGNED_IN: laduje profil, pokazuje app
  - TOKEN_REFRESHED: aktualizuje token bez przeladowania
  - SIGNED_OUT: sprawdza sesje zanim wyczyści stan (zabezpieczenie przed false signout)
- **visibilitychange:** po powrocie na karte sprawdza sesje
- **handleLogout:** czysci stan po signOut() bez czekania na event

## Znane problemy i dług techniczny

1. **Monolityczny plik** — gabinety/index.html ma ~4800 linii, warto rozdzielic na moduły (CSS/JS/HTML)
2. **Brak automatycznych testow** — docelowo Playwright
3. **Logika biznesowa w kliencie** — walidacja powinna byc tez w RLS
4. **Brak error boundary** — bledy JS moga cicho zawieść
5. **FullCalendar license** — "Your license key is invalid" w konsoli
6. **Faktury draft za maj** — nie wyslaly sie do Fakturowni, do zbadania

## W trakcie / nastepne kroki

### Zaplanowane: Auto-przedluzanie serii rezerwacji
- Nowa tabela `booking_series`: tenant_id, room_id, day_of_week, start_time, end_time, auto_renew, is_active
- Przy tworzeniu rezerwacji cyklicznej: zapisz wzorzec + stworz pojedyncze
- Scheduled function (Netlify cron, raz/tydzien): dostawia rezerwacje jesli ostatnia < 4 tyg
- Panel admina: przycisk "Zatrzymaj serie"

### Inne pomysly:
- Automatyczne tworzenie konta Auth przy dodawaniu najemcy
- Podzial kodu na moduly
- Testy Playwright
- Audyt RLS policies
