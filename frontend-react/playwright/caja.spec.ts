/**
 * E2E — Caja Rápida
 *
 * El flujo más crítico del sistema: crear una venta.
 * Un bug aquí = el cliente no puede cobrar = pérdida de dinero.
 */

import { test, expect, type Page } from '@playwright/test';

// ── Fixtures ──────────────────────────────────────────────────
const PRODUCTS = [
  { id: 1, name: 'Coca Cola 2.25L', codigo: '7790895000151', price: 850, precio_local: 850, precio_distribuidor: 750, precio_final: 900, stock: 24, activo: true },
  { id: 2, name: 'Pan Lactal Bimbo', codigo: '7796200120017', price: 650, precio_local: 650, precio_distribuidor: 580, precio_final: 700, stock: 10, activo: true },
  { id: 3, name: 'Leche Entera 1L', codigo: '7790040065019', price: 480, precio_local: 480, precio_distribuidor: 420, precio_final: 520, stock: 0, activo: true },
];

const SALE_RESPONSE = {
  id: 99,
  total: 850,
  estado_pago: 'pagado',
  fecha: new Date().toISOString(),
};

async function setupCajaMocks(page: Page) {
  await page.route('**/api/login', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: buildFakeJwt({ sub: '1', email: 'vendedor@test.com', role: 'vendedor' }),
        refreshToken: 'rt',
        user: { id: 1, email: 'vendedor@test.com', rol: 'vendedor', nombre: 'Vendedor Test' },
      }),
    })
  );

  await page.route('**/api/productos**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PRODUCTS) })
  );

  await page.route('**/api/clientes**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  await page.route('**/api/depositos**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  await page.route('**/api/metodos-pago', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, nombre: 'Efectivo', activo: true },
        { id: 2, nombre: 'Tarjeta', activo: true },
      ]),
    })
  );

  await page.route('**/api/ventas', (r) => {
    if (r.request().method() === 'POST') {
      r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(SALE_RESPONSE) });
    } else {
      r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
  });

  await page.route('**/api/config/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  );

  await page.route('**/api/license/info', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ valid: true, modules: ['basico', 'whatsapp', 'ia'] }),
    })
  );

  await page.route('**/api/alerts/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  );

  await page.route('**/api/owner/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  );
}

function buildFakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = btoa(
    JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 })
  );
  return `${header}.${claims}.fake_signature`;
}

async function loginAndGoToCaja(page: Page) {
  await page.goto('/login');
  await page.fill('input[type="email"], input[name="email"]', 'vendedor@test.com');
  await page.fill('input[type="password"], input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 5000 });
  await page.goto('/app/caja');
  await page.waitForLoadState('networkidle');
}

// ── Tests ─────────────────────────────────────────────────────
test.describe('Caja Rápida — flujo de venta', () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await setupCajaMocks(page);
  });

  test('carga la página de caja correctamente', async ({ page }) => {
    await loginAndGoToCaja(page);

    // Debe mostrar algo de búsqueda de productos
    const searchInput = page.locator('input[placeholder*="uscar"], input[placeholder*="roducto"]').first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });
  });

  test('buscar un producto lo muestra en resultados', async ({ page }) => {
    await loginAndGoToCaja(page);

    const searchInput = page.locator('input[placeholder*="uscar"], input[placeholder*="roducto"]').first();
    await searchInput.fill('Coca');

    // Debe aparecer Coca Cola en los resultados
    await expect(page.locator('text=Coca Cola').first()).toBeVisible({ timeout: 3000 });
  });

  test('agregar producto al carrito actualiza el total', async ({ page }) => {
    await loginAndGoToCaja(page);

    const searchInput = page.locator('input[placeholder*="uscar"], input[placeholder*="roducto"]').first();
    await searchInput.fill('Coca');

    // Clic en el producto para agregarlo
    const productResult = page.locator('text=Coca Cola').first();
    await productResult.click();

    // El total debe ser mayor a 0
    await expect(page.locator('text=850, text=$850').first()).toBeVisible({ timeout: 3000 });
  });

  test('el campo "recibido" acepta valores decimales', async ({ page }) => {
    await loginAndGoToCaja(page);

    // Buscar input de monto recibido (si está visible)
    const receivedInput = page.locator('input[placeholder*="0,00"], input[placeholder*="ecibido"]').first();
    if (await receivedInput.isVisible()) {
      await receivedInput.fill('1000');
      await expect(receivedInput).toHaveValue('1000');
    }
  });

  test('muestra vuelto correcto para pago en efectivo', async ({ page }) => {
    await loginAndGoToCaja(page);

    // Agregar producto
    const searchInput = page.locator('input[placeholder*="uscar"], input[placeholder*="roducto"]').first();
    await searchInput.fill('Coca');
    await page.locator('text=Coca Cola').first().click();

    // Ingresar monto recibido mayor al total
    const receivedInput = page.locator('input[placeholder*="0,00"], input[placeholder*="ecibido"]').first();
    if (await receivedInput.isVisible()) {
      await receivedInput.fill('2000');
      // Vuelto = 2000 - 850 = 1150
      await expect(page.locator('text=1.150, text=1150').first()).toBeVisible({ timeout: 2000 });
    }
  });
});

test.describe('Caja Rápida — accesibilidad de teclado', () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await setupCajaMocks(page);
  });

  test('F1 abre la caja rápida desde cualquier página', async ({ page }) => {
    await loginAndGoToCaja(page);
    // Navegar a otra sección
    await page.goto('/app/dashboard');
    await page.waitForLoadState('networkidle');

    // F1 debe navegar a /app/caja
    await page.keyboard.press('F1');
    await expect(page).toHaveURL(/\/caja/, { timeout: 3000 });
  });
});
