const express = require('express');
const router = express.Router();
const db = require('../db/conexion');
const multer = require('multer');
const xlsx = require('xlsx');
const { registrarAuditoria } = require('../services/auditoriaService');

// Multer config for file uploads in memory
const upload = multer({ storage: multer.memoryStorage() });

// GET / — Listar todos los productos
router.get('/', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id || 1;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10000;
  const offset = (page - 1) * limit;

  try {
    const result = await db.query(
      `SELECT p.*, prov.nombre AS proveedor_nombre 
       FROM productos p 
       LEFT JOIN proveedores prov ON p.proveedor_id = prov.id 
       WHERE p.comercio_id = $1 
       ORDER BY p.nombre ASC
       LIMIT $2 OFFSET $3`,
      [comercioId, limit, offset]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// ── RUTAS ESTÁTICAS — DEBEN IR ANTES DE LAS DINÁMICAS (/:id) ────────────────
// BUG-05 FIX: PUT /aumento-masivo movido aquí para que Express no lo capture
//             como PUT /:id con id="aumento-masivo"
router.put('/aumento-masivo', async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;
  let { porcentaje } = req.body;
  porcentaje = parseFloat(porcentaje);

  if (Number.isNaN(porcentaje)) {
    return res.status(400).json({ error: 'El porcentaje debe ser un número válido' });
  }

  const factor = 1 + porcentaje / 100;

  try {
    const result = await db.query(
      'UPDATE productos SET precio_venta = ROUND(precio_venta * $1, 2), costo = ROUND(costo * $1, 2), updated_at=NOW() WHERE comercio_id = $2',
      [factor, comercioId]
    );
    res.json({ mensaje: `¡Aumento del ${porcentaje}% aplicado a todos los productos!`, productos_afectados: result.rowCount });
  } catch (error) {
    console.error('Error al aplicar el aumento masivo:', error);
    res.status(500).json({ error: 'Error al aplicar el aumento masivo' });
  }
});

// BUG-06 FIX: GET /exportar movido aquí para que Express no lo capture como
//             GET /:id con id="exportar"
router.get('/exportar', async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const result = await db.query(
      'SELECT codigo_barras, nombre, precio_venta, costo, stock, rubro, marca FROM productos WHERE comercio_id = $1 ORDER BY nombre ASC',
      [comercioId]
    );

    const ws = xlsx.utils.json_to_sheet(result.rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Productos');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="productos.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('Error al exportar XLS:', error);
    res.status(500).json({ error: 'Error al exportar lista de precios' });
  }
});

// ── CRUD ─────────────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  // BUG-01 FIX: 'let' en lugar de 'const' para permitir reasignación de rubro
  // al normalizar el nombre con el valor real de la BD.
  let {
    codigo_barras, nombre, precio_venta, costo, stock = 0,
    codigo_secundario = null, codigo_proveedor = null,
    rubro = null, marca = null, proveedor_id = null,
    iva_porcentaje = 21, codigo_proveedor_externo = null, margen_ganancia = null,
    stock_minimo = null, stock_maximo = null
  } = req.body;

  const comercioId = req.usuario?.comercio_id || 1;

  if (!codigo_barras || !nombre || precio_venta == null || costo == null) {
    return res.status(400).json({ error: 'codigo_barras, nombre, precio_venta y costo son obligatorios' });
  }

  if (isNaN(parseFloat(precio_venta)) || isNaN(parseFloat(costo)) || isNaN(parseInt(stock))) {
    return res.status(400).json({ error: 'precio_venta, costo y stock deben ser valores numéricos válidos' });
  }

  try {
    if (rubro) {
      const rubroRow = await db.query(
        'SELECT nombre FROM rubros WHERE LOWER(nombre) = LOWER($1) AND comercio_id = $2',
        [rubro, comercioId]
      );
      if (rubroRow.rowCount === 0) {
        return res.status(400).json({ error: 'El rubro especificado no existe. Por favor, créalo primero.' });
      }
      rubro = rubroRow.rows[0].nombre; // normalizar al nombre exacto de la BD
    }

    // Prevent duplicate by nombre+marca+rubro
    const existing = await db.query(
      'SELECT id FROM productos WHERE nombre = $1 AND marca IS NOT DISTINCT FROM $2 AND rubro IS NOT DISTINCT FROM $3 AND comercio_id = $4 LIMIT 1',
      [nombre, marca, rubro, comercioId]
    );
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'Ya existe un producto con el mismo nombre, marca y rubro en este comercio.' });
    }

    const result = await db.query(
      `INSERT INTO productos (
        codigo_barras, nombre, precio_venta, costo, stock, comercio_id,
        codigo_secundario, codigo_proveedor, rubro, marca, proveedor_id,
        iva_porcentaje, codigo_proveedor_externo, margen_ganancia, fecha_actualizacion_costo,
        stock_minimo, stock_maximo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), $15, $16) RETURNING id`,
      [
        codigo_barras, nombre, precio_venta, costo, stock, comercioId,
        codigo_secundario, codigo_proveedor, rubro, marca, proveedor_id,
        iva_porcentaje, codigo_proveedor_externo, margen_ganancia,
        stock_minimo, stock_maximo
      ]
    );


    await registrarAuditoria({
      tipo_evento: 'STOCK_INGRESO',
      descripcion: `Se agregó al inventario el producto: ${nombre} (Cod: ${codigo_barras}) con stock inicial de ${stock}`,
      usuario_id: req.usuario?.id,
      comercio_id: comercioId
    });

    res.status(201).json({ mensaje: 'Producto agregado exitosamente', id_nuevo: result.rows[0].id });
  } catch (error) {
    console.error('Error al guardar el producto:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'El código de barras ya existe para este comercio' });
    }
    res.status(500).json({ error: 'Error al guardar el producto', detalle: error.message });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  // BUG-01 FIX: 'let' en lugar de 'const' para permitir reasignación de rubro
  let {
    codigo_barras, nombre, precio_venta, costo, stock = 0,
    codigo_secundario = null, codigo_proveedor = null,
    rubro = null, marca = null, proveedor_id = null,
    iva_porcentaje = 21, codigo_proveedor_externo = null, margen_ganancia = null,
    confirmar_variacion = false,
    stock_minimo = null, stock_maximo = null
  } = req.body;
  const comercioId = req.usuario?.comercio_id || 1;

  if (!codigo_barras || !nombre || precio_venta == null || costo == null) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    if (rubro) {
      const rubroRow = await db.query(
        'SELECT nombre FROM rubros WHERE LOWER(nombre) = LOWER($1) AND comercio_id = $2',
        [rubro, comercioId]
      );
      if (rubroRow.rowCount === 0) {
        return res.status(400).json({ error: 'El rubro especificado no existe. Por favor, créalo primero.' });
      }
      rubro = rubroRow.rows[0].nombre; // normalizar al nombre exacto de la BD
    }

    const existing = await db.query(
      'SELECT id FROM productos WHERE nombre = $1 AND marca IS NOT DISTINCT FROM $2 AND rubro IS NOT DISTINCT FROM $3 AND comercio_id = $4 AND id != $5 LIMIT 1',
      [nombre, marca, rubro, comercioId, id]
    );
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'Ya existe otro producto con el mismo nombre, marca y rubro.' });
    }

    // ── CONTROL DE VARIACIÓN DE PRECIO DE COSTO ──────────────────────────────
    if (!confirmar_variacion) {
      const productoActual = await db.query(
        'SELECT costo, precio_venta FROM productos WHERE id = $1 AND comercio_id = $2',
        [id, comercioId]
      );
      if (productoActual.rowCount > 0) {
        const costoAnterior = parseFloat(productoActual.rows[0].costo || 0);
        const costoNuevo = parseFloat(costo);
        const precioAnterior = parseFloat(productoActual.rows[0].precio_venta || 0);
        const precioNuevo = parseFloat(precio_venta);

        // Obtener límite configurado
        const configRes = await db.query(
          "SELECT valor FROM configuracion WHERE comercio_id = $1 AND clave = 'limite_variacion_precio_pct'",
          [comercioId]
        );
        const limitePorc = parseFloat(configRes.rows[0]?.valor || '30');

        const variacionCosto = costoAnterior > 0
          ? Math.abs((costoNuevo - costoAnterior) / costoAnterior) * 100
          : 0;
        const variacionPrecio = precioAnterior > 0
          ? Math.abs((precioNuevo - precioAnterior) / precioAnterior) * 100
          : 0;

        if (variacionCosto > limitePorc || variacionPrecio > limitePorc) {
          return res.status(200).json({
            require_confirm: true,
            mensaje: `La variación de precio supera el límite configurado (${limitePorc}%). ¿Deseas continuar?`,
            variacion_costo_pct: variacionCosto.toFixed(1),
            variacion_precio_pct: variacionPrecio.toFixed(1),
            limite_pct: limitePorc,
          });
        }
      }
    }

    // Determinar si cambió el costo para actualizar fecha
    const productoActualCosto = await db.query(
      'SELECT costo FROM productos WHERE id = $1 AND comercio_id = $2',
      [id, comercioId]
    );
    const costoAnterior = parseFloat(productoActualCosto.rows[0]?.costo || 0);
    const costoNuevo = parseFloat(costo);
    const costoChanged = costoAnterior !== costoNuevo;

    const result = await db.query(
      `UPDATE productos SET 
        codigo_barras=$1, nombre=$2, precio_venta=$3, costo=$4, stock=$5, 
        codigo_secundario=$6, codigo_proveedor=$7, rubro=$8, marca=$9, proveedor_id=$10,
        iva_porcentaje=$11, codigo_proveedor_externo=$12, margen_ganancia=$13,
        fecha_actualizacion_costo = CASE WHEN $4::numeric != costo THEN NOW() ELSE fecha_actualizacion_costo END,
        stock_minimo=$16, stock_maximo=$17,
        updated_at=NOW()
       WHERE id=$14 AND comercio_id=$15 RETURNING id`,
      [
        codigo_barras, nombre, precio_venta, costo, stock,
        codigo_secundario, codigo_proveedor, rubro, marca, proveedor_id,
        iva_porcentaje, codigo_proveedor_externo, margen_ganancia,
        id, comercioId, stock_minimo, stock_maximo
      ]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ mensaje: 'Producto actualizado con éxito' });
  } catch (error) {
    console.error('Error al actualizar el producto:', error);
    if (error.code === '23505') return res.status(409).json({ error: 'El código de barras ya está en uso' });
    if (error.code === '23514') return res.status(409).json({ error: 'El stock no puede ser negativo' });
    res.status(500).json({ error: 'Error al actualizar el producto' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const pResult = await db.query(
      'SELECT nombre FROM productos WHERE id = $1 AND comercio_id = $2',
      [id, comercioId]
    );
    if (pResult.rowCount === 0) return res.status(404).json({ error: 'Producto no encontrado' });

    const nombreProducto = pResult.rows[0].nombre;
    await db.query('DELETE FROM productos WHERE id = $1 AND comercio_id = $2 RETURNING id', [id, comercioId]);

    await registrarAuditoria({
      tipo_evento: 'STOCK_ELIMINACION',
      descripcion: `Se eliminó del stock el producto: ${nombreProducto} (ID: ${id})`,
      usuario_id: req.usuario?.id,
      comercio_id: comercioId
    });

    res.json({ mensaje: 'Producto eliminado con éxito' });
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

router.put('/:id/stock', async (req, res) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id || 1;
  let { cantidad_agregada } = req.body;

  cantidad_agregada = parseInt(cantidad_agregada, 10);
  if (Number.isNaN(cantidad_agregada) || cantidad_agregada <= 0) {
    return res.status(400).json({ error: 'La cantidad debe ser un número válido mayor a 0' });
  }

  try {
    const result = await db.query(
      'UPDATE productos SET stock = stock + $1, updated_at=NOW() WHERE id = $2 AND comercio_id = $3 RETURNING id',
      [cantidad_agregada, id, comercioId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'El producto con ese ID no existe en este comercio' });
    }

    await registrarAuditoria({
      tipo_evento: 'STOCK_RENOVACION',
      descripcion: `Se ingresaron ${cantidad_agregada} unidades al stock del producto ID: ${id}`,
      usuario_id: req.usuario?.id,
      comercio_id: comercioId
    });

    res.json({ mensaje: '¡Stock ingresado correctamente!' });
  } catch (error) {
    console.error('Error al actualizar el stock:', error);
    res.status(500).json({ error: 'Error al actualizar el stock' });
  }
});

router.post('/importar', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(ws);

    let procesados = 0;

    await db.transaction(async (client) => {
      for (const row of data) {
        const pVenta = parseFloat(row.precio_venta);
        const pCosto = parseFloat(row.costo);
        if (!row.codigo_barras || !row.nombre || Number.isNaN(pVenta) || Number.isNaN(pCosto)) continue;

        await client.query(`
          INSERT INTO productos (codigo_barras, nombre, precio_venta, costo, stock, rubro, marca, comercio_id) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (codigo_barras, comercio_id) DO UPDATE SET 
            nombre=EXCLUDED.nombre, 
            precio_venta=EXCLUDED.precio_venta, 
            costo=EXCLUDED.costo, 
            stock=EXCLUDED.stock,
            rubro=EXCLUDED.rubro,
            marca=EXCLUDED.marca,
            updated_at=NOW()
        `, [
          row.codigo_barras.toString(), row.nombre, pVenta, pCosto,
          parseInt(row.stock || 0), row.rubro || null, row.marca || null, comercioId
        ]);
        procesados++;
      }
    });

    res.json({ mensaje: `Importación completada. Se procesaron ${procesados} productos.` });
  } catch (error) {
    console.error('Error al importar XLS:', error);
    res.status(500).json({ error: 'Error al procesar el archivo Excel', detalle: error.message });
  }
});

module.exports = router;
