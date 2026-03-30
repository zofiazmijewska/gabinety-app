# CLAUDE.md — Pracownia Psychoterapii Zofii Żmijewskiej

## Projekt

Strona internetowa i aplikacja do zarządzania gabinetami psychoterapeutycznymi.

- **Strona główna** (`index.html`) — wizytówka Pracowni, statyczny HTML
- **Aplikacja gabinetów** (`gabinety/index.html`) — system rezerwacji, rozliczeń i faktur
- **Backend** — Supabase (PostgreSQL + Auth + RLS), bez własnego serwera
- **Hosting** — Netlify z auto-deploy z GitHub (`main` branch)
- **Serverless** — `netlify/functions/generate-invoices.js` (Fakturownia API)

### Stack technologiczny

- Czysty HTML/CSS/JavaScript (bez frameworka)
- Supabase JS Client (z CDN)
- FullCalendar 6 (widok kalendarza)
- Netlify Functions (Node.js)

### Domena i deploy

- `zofiazmijewska.pl/` → strona główna
- `zofiazmijewska.pl/gabinety/` → aplikacja (noindex)
- GitHub repo: `zofiazmijewska/gabinety-app`
- Push do `main` = automatyczny deploy na Netlify

### Lokalne testowanie

```bash
# Serwer deweloperski (preview_start "dev")
python3 -m http.server 8234
# Strona: localhost:8234/
# Gabinety: localhost:8234/gabinety/
```

---

## Użytkownik

Zofia nie jest programistką — vibe-coduje swoje aplikacje z pomocą AI. Potrzebuje prowadzenia po dobrych praktykach, nie tylko wykonywania poleceń.

---

## Zasady pracy

### 1. Wyjaśniaj co robisz i dlaczego

- Przed zmianą wyjaśnij co zamierzasz zrobić, dlaczego i jakie są alternatywy
- Po zmianach podsumuj co się zmieniło i co to oznacza dla użytkownika
- Tłumacz pojęcia techniczne prostym językiem
- Jeśli podejmujesz decyzję architektoniczną — uzasadnij ją

### 2. Jeden feature na raz

- Nie rób wielu rzeczy jednocześnie
- Proponuj kolejność: co najpierw, co potem, co może poczekać
- Każdy feature: zaimplementuj → przetestuj lokalnie → pokaż użytkownikowi → commit → push
- Nie pushuj bez potwierdzenia że działa

### 3. Testuj przed deployem

- Zawsze uruchom lokalny podgląd przed pushem
- Zasugeruj Zofii co przetestować manualnie ("wejdź w kalendarz, spróbuj zarezerwować godzinę, sprawdź czy widać w historii")
- Jeśli zmiana dotyczy bazy danych — sprawdź najpierw na danych testowych
- Po pushu zweryfikuj że deploy się powiódł i strona działa

### 4. Git — małe, opisowe commity

- Commituj po każdym działającym feature/fixie, nie po kilku na raz
- Pisz commity po polsku lub angielsku, ale zawsze opisowo
- Przed dużymi zmianami upewnij się że wszystko jest scommitowane
- Sugeruj Zofii kiedy warto zrobić commit ("mamy działający fix, zacommitujmy zanim pójdziemy dalej")

### 5. Sugeruj ulepszenia architektury

- Gdy plik jest za duży (gabinety/index.html ma 4700+ linii) — zasugeruj podział na moduły
- Gdy kod się powtarza — zasugeruj refactor
- Gdy logika jest skomplikowana — zasugeruj komentarze lub uproszczenie
- Nie rób tego w trakcie innego zadania — zapisz jako sugestię na później
- Proponuj ulepszenia jako osobne zadania, nie jako część bieżącej pracy

### 6. Bezpieczeństwo

- Nigdy nie wrzucaj kluczy API, haseł ani tokenów do repozytorium
- Przy zmianach w bazie danych — sprawdź czy RLS policies są kompletne
- Przypominaj o audycie RLS po dodaniu nowej tabeli lub kolumny
- Supabase anon key jest publiczny z założenia — bezpieczeństwo zapewnia RLS

### 7. Ostrzegaj przed ryzykiem

- Przed zmianą która może coś zepsuć — powiedz co może pójść nie tak
- Przed zmianą w bazie produkcyjnej — zaproponuj backup lub test
- Jeśli zmiana jest nieodwracalna — wyraźnie o tym poinformuj
- Lepiej zapytać raz za dużo niż raz za mało

### 8. Proponuj co dalej

- Po zakończeniu zadania powiedz co jeszcze warto zrobić
- Sugeruj testy, które warto napisać (nawet proste manualne checklisty)
- Zaproponuj porządki jeśli widzisz bałagan w kodzie
- Prowadź listę znanych problemów i sugestii ulepszeń

---

## Znane ograniczenia i dług techniczny

- `gabinety/index.html` to monolityczny plik 4700+ linii — warto rozdzielić na moduły JS
- Brak automatycznych testów — warto dodać przynajmniej testy krytycznych ścieżek
- Cała logika biznesowa jest po stronie klienta — walidacja powinna być też w RLS/bazie
- Brak error boundary — błędy JS mogą cicho zawieść bez informacji dla użytkownika
