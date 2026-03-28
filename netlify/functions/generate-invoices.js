/**
 * Netlify Function: generate-invoices
 * Tworzy faktury w Fakturownia.pl na podstawie danych z /gabinety.
 *
 * Wywoływana przez panel admina przy kliknięciu "Generuj faktury".
 * Odbiera gotowe pozycje faktur i wysyła je do API Fakturownia.
 */

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // ── Autoryzacja: sprawdź Supabase JWT ──
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Brak tokenu autoryzacji' }) };
  }

  // Weryfikuj token z Supabase i sprawdź czy użytkownik jest adminem
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://clzfuvicdxewtovniriv.supabase.co';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (SUPABASE_SERVICE_KEY) {
    try {
      const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_SERVICE_KEY }
      });
      if (!userResp.ok) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Nieprawidłowy token' }) };
      }
      const user = await userResp.json();
      // Sprawdź czy jest adminem
      const tenantResp = await fetch(`${SUPABASE_URL}/rest/v1/tenants?auth_user_id=eq.${user.id}&select=is_admin`, {
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_SERVICE_KEY }
      });
      const tenants = await tenantResp.json();
      if (!tenants || !tenants[0] || !tenants[0].is_admin) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Brak uprawnień administratora' }) };
      }
    } catch (e) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Błąd weryfikacji: ' + e.message }) };
    }
  }

  // ── Konfiguracja (zmienne środowiskowe Netlify) ──
  const DOMAIN      = process.env.FAKTUROWNIA_DOMAIN;       // zzzmijewska
  const API_TOKEN   = process.env.FAKTUROWNIA_API_TOKEN;    // rgZjcyzoNVClENFigzAT
  const DEPT_ID     = process.env.FAKTUROWNIA_DEPT_WYNAJEM; // 1624831
  const PAYMENT_DAYS = parseInt(process.env.FAKTUROWNIA_PAYMENT_DAYS || '8');

  if (!DOMAIN || !API_TOKEN || !DEPT_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Brak konfiguracji Fakturownia (zmienne środowiskowe)' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Nieprawidłowy JSON' }) };
  }

  const { billing_month, invoices } = body;
  if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ created: 0, results: [] }) };
  }

  // ── Daty ──
  const issueDate = billing_month.substring(0, 10); // YYYY-MM-DD (1. dzień miesiąca)
  const paymentDate = addDays(issueDate, PAYMENT_DAYS);

  const results = [];
  let created = 0;

  for (const inv of invoices) {
    try {
      const payload = {
        api_token: API_TOKEN,
        invoice: {
          kind: 'vat',
          sell_date: issueDate,
          issue_date: issueDate,
          payment_to: paymentDate,
          payment_type: 'transfer',
          place: 'Warszawa',
          seller_person: 'Zofia Żmijewska',
          exempt_tax_kind: 'Zwolnienie ze względu na rodzaj prowadzonej działalności (art. 43 ust 1 ustawy o VAT)',
          department_id: parseInt(DEPT_ID),
          client_id: inv.fakturownia_client_id,
          buyer_name: inv.buyer_name,
          buyer_tax_no: inv.nip || '',
          buyer_email: inv.buyer_email || '',
          positions: inv.positions
        }
      };

      const resp = await fetch(
        `https://${DOMAIN}.fakturownia.pl/invoices.json`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        }
      );

      if (!resp.ok) {
        const errText = await resp.text();
        results.push({ tenant_id: inv.tenant_id, error: errText });
        continue;
      }

      const data = await resp.json();
      results.push({
        tenant_id: inv.tenant_id,
        fakturownia_id: data.id,
        number: data.number,
        total: data.price_gross
      });
      created++;

    } catch (e) {
      results.push({ tenant_id: inv.tenant_id, error: e.message });
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ created, results })
  };
};

// ── Helper ──
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
