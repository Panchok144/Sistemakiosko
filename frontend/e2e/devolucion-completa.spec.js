import { test, expect } from '@playwright/test';
import { loginAsAdmin, asegurarCajaAbierta } from './helpers.js';

test.describe('Flujo Crítico 2: Devolución Completa', () => {
  test('debe permitir buscar una venta existente, seleccionar productos a devolver y registrar nota de crédito', async ({ page }) => {
    // 1. Iniciar sesión
    await loginAsAdmin(page);

    await page.evaluate(() => {
      window.open = () => null;
    });

    // 2. Asegurar que haya caja abierta para poder operar el POS
    await asegurarCajaAbierta(page);

    // 3. Ir a Punto de Venta y generar una venta rápida para devolver
    await page.goto('/ventas');
    await page.waitForLoadState('networkidle');

    const gridBtn = page.getByRole('button', { name: 'Grilla' });
    if (await gridBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gridBtn.click();
    }

    const primerProducto = page.locator('button:has(h3)').first();
    await expect(primerProducto).toBeVisible({ timeout: 10000 });
    await primerProducto.click();

    const cobrarBtn = page.locator('button:has-text("Confirmar y Cobrar")');
    await expect(cobrarBtn).toBeEnabled({ timeout: 10000 });
    await cobrarBtn.click();
    await expect(page.locator('text=Venta Confirmada')).toBeVisible({ timeout: 10000 });

    // Obtener el ID de la venta recién realizada mediante la API
    const ventaId = await page.evaluate(async () => {
      const token = localStorage.getItem('kiosko_token');
      const res = await fetch('http://localhost:4000/api/ventas', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      return data[0]?.id;
    });

    expect(ventaId).toBeTruthy();

    // 4. Navegar al módulo de Devoluciones
    await page.goto('/devoluciones');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1:has-text("Devoluciones")')).toBeVisible({ timeout: 10000 });

    // 5. Buscar la venta por ID
    const searchInput = page.locator('input[placeholder*="número de ticket/venta"]');
    await searchInput.fill(String(ventaId));
    await page.locator('button:has-text("Buscar Venta")').click();

    // Verificar que se cargue el detalle de la venta
    await expect(page.locator(`text=Venta #${ventaId}`)).toBeVisible({ timeout: 10000 });

    // 6. Configurar cantidad a devolver (1 unidad)
    const cantidadInput = page.locator('table input[type="number"]').first();
    await cantidadInput.fill('1');

    // Motivo
    const motivoInput = page.locator('input[placeholder*="Motivo de la devolución"], input[placeholder*="Producto fallado"]');
    await motivoInput.fill('Devolución de prueba automatizada E2E');

    // 7. Confirmar devolución
    await page.locator('button:has-text("Confirmar Devolución y Restaurar Stock")').click();

    // Confirmación en SweetAlert
    const confirmSwalBtn = page.locator('.swal2-confirm');
    await expect(confirmSwalBtn).toBeVisible({ timeout: 10000 });
    await confirmSwalBtn.click();

    // 8. Validar mensaje de éxito
    await expect(page.locator('text=Devolución procesada y stock restaurado')).toBeVisible({ timeout: 10000 });
  });
});
