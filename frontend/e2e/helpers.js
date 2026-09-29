/**
 * frontend/e2e/helpers.js
 * Helpers para pruebas Playwright en KIOSKOPRO
 */

export async function loginAsAdmin(page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Si ya estamos autenticados en el Panel Principal
  const isPanel = await page.locator('text=Panel Principal').isVisible({ timeout: 2000 }).catch(() => false);
  if (isPanel) return;

  // Llenar formulario de login
  const userInput = page.locator('input[placeholder="admin"]');
  await userInput.waitFor({ state: 'visible', timeout: 15000 });
  await userInput.fill('fran');

  const passInput = page.locator('input[placeholder="••••••••"]');
  await passInput.fill('admin123');

  await page.locator('button[type="submit"]').click();

  // Esperar a que el layout del dashboard cargue
  await page.waitForSelector('text=Panel Principal', { timeout: 20000 });
}

export async function asegurarCajaAbierta(page) {
  await page.goto('/caja');
  await page.waitForLoadState('networkidle');

  const abrirBtn = page.locator('button:has-text("Abrir Turno de Caja")');
  const necesitaAbrir = await abrirBtn.isVisible({ timeout: 2000 }).catch(() => false);

  if (necesitaAbrir) {
    await page.locator('input[placeholder="0.00"]').first().fill('5000');
    await abrirBtn.click();

    // Cerrar SweetAlert si aparece
    const swalConfirm = page.locator('.swal2-confirm');
    if (await swalConfirm.isVisible({ timeout: 4000 }).catch(() => false)) {
      await swalConfirm.click();
    }

    await page.waitForSelector('button:has-text("Cerrar Caja y Finalizar Turno")', { timeout: 10000 });
  }
}
