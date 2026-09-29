import { test, expect } from '@playwright/test';
import { loginAsAdmin, asegurarCajaAbierta } from './helpers.js';

test.describe('Flujo Crítico 1: Vender -> Cerrar Caja -> Reporte', () => {
  test('debe permitir abrir caja, realizar una venta, cerrar caja y visualizar reportes', async ({ page }) => {
    // 1. Iniciar sesión como administrador
    await loginAsAdmin(page);

    // Evitar apertura de popups de impresión PDF
    await page.evaluate(() => {
      window.open = () => null;
    });

    // 2. Asegurar que la caja esté abierta
    await asegurarCajaAbierta(page);
    await expect(page.locator('button:has-text("Cerrar Caja y Finalizar Turno")')).toBeVisible({ timeout: 10000 });

    // 3. Ir a Punto de Venta y realizar una venta
    await page.goto('/ventas');
    await page.waitForLoadState('networkidle');

    // Cambiar a vista grilla para seleccionar producto
    const gridBtn = page.getByRole('button', { name: 'Grilla' });
    if (await gridBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gridBtn.click();
    }

    // Seleccionar el primer producto disponible
    const primerProducto = page.locator('button:has(h3)').first();
    await expect(primerProducto).toBeVisible({ timeout: 10000 });
    await primerProducto.click();

    // Verificar que el botón de finalizar venta esté habilitado
    const cobrarBtn = page.locator('button:has-text("Confirmar y Cobrar")');
    await expect(cobrarBtn).toBeEnabled({ timeout: 10000 });

    // Confirmar y cobrar en efectivo (default)
    await cobrarBtn.click();

    // SweetAlert de confirmación de venta
    await expect(page.locator('.swal2-popup')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Venta Confirmada')).toBeVisible({ timeout: 10000 });

    // 4. Regresar a Caja y Cerrar Turno
    await page.goto('/caja');
    await page.waitForLoadState('networkidle');

    // Completar conteo final en caja y cerrar
    const montoFinalInput = page.locator('input[placeholder="0.00"]').first();
    await expect(montoFinalInput).toBeVisible({ timeout: 10000 });
    await montoFinalInput.fill('7000');

    await page.locator('button:has-text("Cerrar Caja y Finalizar Turno")').click();

    // Confirmar que la caja se cerró exitosamente
    await expect(page.locator('.swal2-popup')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Caja Cerrada')).toBeVisible({ timeout: 10000 });

    // Cerrar modal de sweetalert si sigue presente
    const swalConfirm = page.locator('.swal2-confirm');
    if (await swalConfirm.isVisible({ timeout: 2000 }).catch(() => false)) {
      await swalConfirm.click();
    }

    // 5. Ir a Reportes & Analytics y validar renderizado
    await page.goto('/reportes');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1:has-text("Reportes y Analytics")')).toBeVisible({ timeout: 10000 });

    // Navegar entre tabs de reportes para verificar que todos responden
    const tabs = ['📦 Valorización Stock', '💰 Márgenes & Ganancia', '📊 Ventas'];
    for (const tabName of tabs) {
      const tabButton = page.locator(`button:has-text("${tabName}")`);
      if (await tabButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await tabButton.click();
        await page.waitForLoadState('networkidle');
      }
    }
  });
});
