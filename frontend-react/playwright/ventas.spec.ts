import { test, expect } from '@playwright/test';

test('crear venta completa desde caja rapida', async ({ page }) => {
  await page.goto('/app/caja');
  await page.getByTestId('buscar-producto').fill('Coca');
  await page.getByTestId('producto-coca-cola-2l').click();
  await page.getByTestId('btn-cobrar-efectivo').click();
  await page.getByRole('button', { name: 'Cobrar' }).click();
  await expect(page.getByTestId('ticket')).toBeVisible();
});
