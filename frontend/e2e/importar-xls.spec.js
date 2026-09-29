import { test, expect } from '@playwright/test';
import * as xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loginAsAdmin } from './helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Flujo Crítico 3: Importación Masiva XLS', () => {
  const tempFilePath = path.join(__dirname, `import_test_${Date.now()}.xlsx`);
  const uniqueCode = `E2E${Date.now()}`;
  const productName = `Golosina Importada ${Date.now()}`;

  test.beforeAll(() => {
    // Crear archivo Excel de prueba con cabeceras requeridas
    const rows = [
      {
        codigo_barras: uniqueCode,
        nombre: productName,
        precio_venta: 1250.50,
        costo: 750.00,
        stock: 30,
        rubro: 'Golosinas & Chocolates',
        marca: 'TestBrand'
      }
    ];

    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Productos');
    xlsx.writeFile(wb, tempFilePath);
  });

  test.afterAll(() => {
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (_) {}
    }
  });

  test('debe permitir importar productos masivamente vía archivo XLS y reflejarse en catálogo', async ({ page }) => {
    // 1. Iniciar sesión
    await loginAsAdmin(page);

    // 2. Ir a Inventario
    await page.goto('/inventario');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1:has-text("Inventario")')).toBeVisible({ timeout: 10000 });

    // 3. Subir archivo Excel a través del input de tipo file
    const fileInput = page.locator('input[type="file"][accept*=".xlsx"]');
    await fileInput.setInputFiles(tempFilePath);

    // 4. Validar notificación de éxito de SweetAlert
    await expect(page.locator('.swal2-popup')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Éxito')).toBeVisible({ timeout: 10000 });

    // Cerrar SweetAlert si tiene botón OK
    const okBtn = page.locator('.swal2-confirm');
    if (await okBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await okBtn.click();
    }

    // 5. Buscar el producto recién importado en el catálogo para comprobar su presencia
    const searchInput = page.locator('input[placeholder*="Buscar por nombre"]');
    await searchInput.fill(uniqueCode);

    // Esperar a que el filtro se aplique y haga match con el producto único
    const catRow = page.locator('tr:has-text("Golosinas & Chocolates")');
    await expect(catRow).toBeVisible({ timeout: 10000 });
    await catRow.click();

    // Verificar que el producto aparezca en la tabla
    await expect(page.locator(`text=${productName}`)).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text=${uniqueCode}`)).toBeVisible({ timeout: 10000 });
  });
});
