'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/conexion');
const { autorizarRoles } = require('../middleware/auth');
const { registrarAuditoria } = require('../services/auditoriaService');

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/promociones — Listar promociones del comercio
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId) return res.status(401).json({ error: 'No autorizado' });

  try {
    const result = await db.query(
      `SELECT * FROM promociones
       WHERE comercio_id = $1
       ORDER BY activa DESC, id DESC`,
      [comercioId]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/promociones/evaluar — Evalúa un carrito y retorna descuentos aplicables
//  Body: { items: [{ id, cantidad, precio_unitario }] }
//  Response: { items_con_promo: [...], descuento_total, promos_aplicadas: [...] }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/evaluar', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId) return res.status(401).json({ error: 'No autorizado' });

  const { items = [] } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.json({ items_con_promo: [], descuento_total: 0, promos_aplicadas: [] });
  }

  try {
    const ahora = new Date();
    const diaSemana = ahora.getDay(); // 0=Dom...6=Sab
    const hora = ahora.getHours();

    // Cargar promociones activas y vigentes
    const promosRes = await db.query(
      `SELECT * FROM promociones
       WHERE comercio_id = $1
         AND activa = true
         AND (vigencia_desde IS NULL OR vigencia_desde <= CURRENT_DATE)
         AND (vigencia_hasta IS NULL OR vigencia_hasta >= CURRENT_DATE)
       ORDER BY id ASC`,
      [comercioId]
    );

    const promos = promosRes.rows;

    // Cargar datos de productos para rubros
    const productIds = items.map(i => i.id);
    const prodRes = await db.query(
      `SELECT id, rubro, precio_venta FROM productos
       WHERE id = ANY($1) AND comercio_id = $2`,
      [productIds, comercioId]
    );
    const prodMap = {};
    for (const p of prodRes.rows) prodMap[p.id] = p;

    // Copia de items con descuento inicializado
    const itemsConPromo = items.map(item => ({
      ...item,
      descuento_unitario: 0,
      promo_aplicada: null,
    }));

    const promosAplicadas = [];
    let descuentoTotal = 0;

    for (const promo of promos) {
      const params = promo.parametros || {};

      // Verificar franja horaria si aplica
      if (promo.dias_semana && promo.dias_semana.length > 0) {
        if (!promo.dias_semana.includes(diaSemana)) continue;
      }
      if (promo.hora_desde !== null && promo.hora_hasta !== null) {
        if (hora < promo.hora_desde || hora >= promo.hora_hasta) continue;
      }

      if (promo.tipo === '2x1') {
        // Aplica a productos específicos: params.producto_id
        const prodId = Number(params.producto_id);
        const itemIdx = itemsConPromo.findIndex(i => i.id === prodId && !i.promo_aplicada);
        if (itemIdx === -1) continue;
        const item = itemsConPromo[itemIdx];
        if (item.cantidad < 2) continue;

        const paresGratis = Math.floor(item.cantidad / 2);
        const descUnitario = parseFloat(item.precio_unitario || 0);
        const descTotal = paresGratis * descUnitario;

        itemsConPromo[itemIdx].descuento_unitario += descTotal / item.cantidad;
        itemsConPromo[itemIdx].promo_aplicada = promo.nombre;
        promosAplicadas.push({ id: promo.id, nombre: promo.nombre, descuento: descTotal });
        descuentoTotal += descTotal;

      } else if (promo.tipo === 'nporx') {
        // N productos al precio de X: params = { producto_id, n, x }
        const prodId = Number(params.producto_id);
        const n = Number(params.n || 2);
        const x = Number(params.x || 1);
        const itemIdx = itemsConPromo.findIndex(i => i.id === prodId && !i.promo_aplicada);
        if (itemIdx === -1) continue;
        const item = itemsConPromo[itemIdx];
        if (item.cantidad < n) continue;

        const gruposCompletos = Math.floor(item.cantidad / n);
        const unitario = parseFloat(item.precio_unitario || 0);
        // Paga x por cada n: descuento = (n - x) * precio_unitario * grupos
        const descTotal = gruposCompletos * (n - x) * unitario;

        itemsConPromo[itemIdx].descuento_unitario += descTotal / item.cantidad;
        itemsConPromo[itemIdx].promo_aplicada = promo.nombre;
        promosAplicadas.push({ id: promo.id, nombre: promo.nombre, descuento: descTotal });
        descuentoTotal += descTotal;

      } else if (promo.tipo === 'pctproducto') {
        // % descuento en producto específico: params = { producto_id, porcentaje }
        const prodId = Number(params.producto_id);
        const pct = Number(params.porcentaje || 0);
        const itemIdx = itemsConPromo.findIndex(i => i.id === prodId && !i.promo_aplicada);
        if (itemIdx === -1) continue;
        const item = itemsConPromo[itemIdx];
        const subtotalItem = parseFloat(item.precio_unitario || 0) * item.cantidad;
        const descTotal = subtotalItem * (pct / 100);

        itemsConPromo[itemIdx].descuento_unitario += descTotal / item.cantidad;
        itemsConPromo[itemIdx].promo_aplicada = promo.nombre;
        promosAplicadas.push({ id: promo.id, nombre: promo.nombre, descuento: descTotal });
        descuentoTotal += descTotal;

      } else if (promo.tipo === 'pctrubro') {
        // % descuento en todos los productos de un rubro: params = { rubro, porcentaje }
        const rubro = params.rubro;
        const pct = Number(params.porcentaje || 0);
        let descRubro = 0;

        for (let i = 0; i < itemsConPromo.length; i++) {
          const item = itemsConPromo[i];
          if (item.promo_aplicada) continue;
          const prod = prodMap[item.id];
          if (!prod || prod.rubro !== rubro) continue;
          const subtotalItem = parseFloat(item.precio_unitario || 0) * item.cantidad;
          const descItem = subtotalItem * (pct / 100);
          itemsConPromo[i].descuento_unitario += descItem / item.cantidad;
          itemsConPromo[i].promo_aplicada = promo.nombre;
          descRubro += descItem;
        }

        if (descRubro > 0) {
          promosAplicadas.push({ id: promo.id, nombre: promo.nombre, descuento: descRubro });
          descuentoTotal += descRubro;
        }

      } else if (promo.tipo === 'pcthorario') {
        // % descuento en horario específico (ya validado arriba): params = { porcentaje }
        const pct = Number(params.porcentaje || 0);
        let descHorario = 0;

        for (let i = 0; i < itemsConPromo.length; i++) {
          const item = itemsConPromo[i];
          if (item.promo_aplicada) continue;
          const subtotalItem = parseFloat(item.precio_unitario || 0) * item.cantidad;
          const descItem = subtotalItem * (pct / 100);
          itemsConPromo[i].descuento_unitario += descItem / item.cantidad;
          itemsConPromo[i].promo_aplicada = promo.nombre;
          descHorario += descItem;
        }

        if (descHorario > 0) {
          promosAplicadas.push({ id: promo.id, nombre: promo.nombre, descuento: descHorario });
          descuentoTotal += descHorario;
        }
      }
    }

    res.json({
      items_con_promo: itemsConPromo,
      descuento_total: Math.round(descuentoTotal * 100) / 100,
      promos_aplicadas: promosAplicadas,
    });
  } catch (error) { next(error); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/promociones — Crear promoción
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', autorizarRoles('administrador', 'dueno'), async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const usuarioId = req.usuario?.id;
  if (!comercioId) return res.status(401).json({ error: 'No autorizado' });

  const {
    nombre, tipo, parametros = {}, vigencia_desde = null, vigencia_hasta = null,
    dias_semana = null, hora_desde = null, hora_hasta = null, activa = true,
  } = req.body;

  if (!nombre || !tipo) {
    return res.status(400).json({ error: 'Nombre y tipo son obligatorios' });
  }

  const tiposValidos = ['2x1', 'nporx', 'pctrubro', 'pcthorario', 'pctproducto'];
  if (!tiposValidos.includes(tipo)) {
    return res.status(400).json({ error: `Tipo inválido. Valores aceptados: ${tiposValidos.join(', ')}` });
  }

  try {
    const result = await db.query(
      `INSERT INTO promociones
         (comercio_id, nombre, tipo, parametros, vigencia_desde, vigencia_hasta,
          dias_semana, hora_desde, hora_hasta, activa)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [comercioId, nombre, tipo, JSON.stringify(parametros), vigencia_desde, vigencia_hasta,
       dias_semana, hora_desde, hora_hasta, activa]
    );

    await registrarAuditoria({
      tipo_evento: 'PROMO_CREADA',
      descripcion: `Promoción "${nombre}" (${tipo}) creada`,
      usuario_id: usuarioId,
      comercio_id: comercioId,
    });

    res.status(201).json({ mensaje: 'Promoción creada', promocion: result.rows[0] });
  } catch (error) { next(error); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PUT /api/promociones/:id — Actualizar promoción
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', autorizarRoles('administrador', 'dueno'), async (req, res, next) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId) return res.status(401).json({ error: 'No autorizado' });

  const {
    nombre, tipo, parametros, vigencia_desde, vigencia_hasta,
    dias_semana, hora_desde, hora_hasta, activa,
  } = req.body;

  try {
    const result = await db.query(
      `UPDATE promociones
       SET nombre          = COALESCE($1, nombre),
           tipo            = COALESCE($2, tipo),
           parametros      = COALESCE($3, parametros),
           vigencia_desde  = $4,
           vigencia_hasta  = $5,
           dias_semana     = $6,
           hora_desde      = $7,
           hora_hasta      = $8,
           activa          = COALESCE($9, activa),
           updated_at      = NOW()
       WHERE id = $10 AND comercio_id = $11
       RETURNING *`,
      [nombre, tipo, parametros ? JSON.stringify(parametros) : null,
       vigencia_desde || null, vigencia_hasta || null,
       dias_semana || null, hora_desde ?? null, hora_hasta ?? null,
       activa, id, comercioId]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Promoción no encontrada' });
    res.json({ mensaje: 'Promoción actualizada', promocion: result.rows[0] });
  } catch (error) { next(error); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/promociones/:id — Eliminar promoción
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', autorizarRoles('administrador', 'dueno'), async (req, res, next) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId) return res.status(401).json({ error: 'No autorizado' });

  try {
    const result = await db.query(
      'DELETE FROM promociones WHERE id = $1 AND comercio_id = $2 RETURNING id, nombre',
      [id, comercioId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Promoción no encontrada' });
    res.json({ mensaje: `Promoción "${result.rows[0].nombre}" eliminada` });
  } catch (error) { next(error); }
});

module.exports = router;
