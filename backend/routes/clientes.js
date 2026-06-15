const express = require('express');
const router = express.Router();
const db = require('../db/conexion');
const { registrarAuditoria } = require('../services/auditoriaService');

// Validador CUIT/CUIL argentino (módulo 97)
function validarCuit(cuit) {
  if (!cuit) return true; // Opcional
  const limpio = cuit.replace(/[-\s]/g, '');
  if (!/^\d{11}$/.test(limpio)) return false;
  const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = multiplicadores.reduce((acc, mult, i) => acc + parseInt(limpio[i]) * mult, 0);
  const resto = suma % 11;
  const digitoVerificador = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return digitoVerificador === parseInt(limpio[10]);
}

// GET /api/clientes
router.get('/', async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;
  try {
    const result = await db.query(
      'SELECT * FROM clientes WHERE comercio_id = $1 ORDER BY nombre ASC',
      [comercioId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener clientes:', error);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

// POST /api/clientes
router.post('/', async (req, res) => {
  const {
    nombre, documento, email = null, telefono = null, direccion = null,
    cuit = null, condicion_fiscal = 'consumidor_final',
    tiene_cuenta_corriente = false, credito_limite = 0, tipo_negocio = null,
  } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  if (cuit && !validarCuit(cuit)) {
    return res.status(400).json({ error: 'El CUIT ingresado no es válido (verificar dígito verificador)' });
  }

  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const result = await db.query(
      `INSERT INTO clientes 
         (nombre, documento, email, telefono, direccion, cuit, condicion_fiscal,
          tiene_cuenta_corriente, credito_limite, tipo_negocio, comercio_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [nombre, documento, email, telefono, direccion, cuit, condicion_fiscal,
       tiene_cuenta_corriente, credito_limite, tipo_negocio, comercioId]
    );

    await registrarAuditoria({
      tipo_evento: 'CLIENTE_AGREGADO',
      descripcion: `Se agregó el cliente: ${nombre} (${documento || cuit || 'sin doc'})`,
      usuario_id: req.usuario?.id,
      comercio_id: comercioId,
    });

    res.status(201).json({ mensaje: '¡Cliente registrado con éxito!', id: result.rows[0].id });
  } catch (error) {
    console.error('Error al guardar el cliente:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un cliente con ese documento' });
    }
    res.status(500).json({ error: 'Error al guardar el cliente', detalle: error.message });
  }
});

// PUT /api/clientes/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    nombre, documento, email, telefono, direccion,
    cuit = null, condicion_fiscal = 'consumidor_final',
    tiene_cuenta_corriente = false, credito_limite = 0, tipo_negocio = null,
  } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  if (cuit && !validarCuit(cuit)) {
    return res.status(400).json({ error: 'El CUIT ingresado no es válido (verificar dígito verificador)' });
  }

  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const result = await db.query(
      `UPDATE clientes 
       SET nombre=$1, documento=$2, email=$3, telefono=$4, direccion=$5,
           cuit=$6, condicion_fiscal=$7, tiene_cuenta_corriente=$8, credito_limite=$9,
           tipo_negocio=$10, updated_at=NOW()
       WHERE id=$11 AND comercio_id=$12 RETURNING id`,
      [nombre, documento, email, telefono, direccion,
       cuit, condicion_fiscal, tiene_cuenta_corriente, credito_limite,
       tipo_negocio, id, comercioId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ mensaje: '¡Cliente actualizado con éxito!' });
  } catch (error) {
    console.error('Error al actualizar el cliente:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe otro cliente con ese documento' });
    }
    res.status(500).json({ error: 'Error al actualizar el cliente', detalle: error.message });
  }
});

// PUT /api/clientes/:id/bloquear — Bloquea o desbloquea al cliente
router.put('/:id/bloquear', async (req, res) => {
  const { id } = req.params;
  const { bloqueado } = req.body;
  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const result = await db.query(
      'UPDATE clientes SET bloqueado = $1, updated_at = NOW() WHERE id = $2 AND comercio_id = $3 RETURNING id, nombre, bloqueado',
      [!!bloqueado, id, comercioId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    const c = result.rows[0];
    res.json({ mensaje: `Cliente ${c.bloqueado ? 'bloqueado' : 'desbloqueado'} con éxito`, cliente: c });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar estado del cliente' });
  }
});

// DELETE /api/clientes/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const result = await db.query(
      'DELETE FROM clientes WHERE id = $1 AND comercio_id = $2 RETURNING id',
      [id, comercioId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

    await registrarAuditoria({
      tipo_evento: 'CLIENTE_ELIMINADO',
      descripcion: `Se eliminó un cliente con ID: ${id}`,
      usuario_id: req.usuario?.id,
      comercio_id: comercioId,
    });

    res.json({ mensaje: '¡Cliente eliminado con éxito!' });
  } catch (error) {
    console.error('Error al eliminar el cliente:', error);
    res.status(500).json({ error: 'Error al eliminar el cliente', detalle: error.message });
  }
});

module.exports = router;
