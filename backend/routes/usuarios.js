const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db/conexion');
const bcrypt = require('bcryptjs');
const { authMiddleware, autorizarRoles } = require('../middleware/auth');
const { registrarAuditoria } = require('../services/auditoriaService');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // Límite de 10 peticiones por IP
  message: { error: 'Demasiados intentos de inicio de sesión, intente de nuevo en 15 minutos' },
  standardHeaders: true,
  legacyHeaders: false,
});

if (!process.env.JWT_SECRET) {
  console.error('\u274c FATAL: JWT_SECRET no está definido en las variables de entorno. El servidor no puede iniciar de forma segura.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

const normalizarRol = (rol) => {
  const valor = (rol || '').toString().trim().toLowerCase();

  if (valor === 'superadmin' || valor === 'super_admin' || valor === 'super') return 'superadmin';
  if (valor === 'dueno' || valor === 'dueño' || valor === 'owner') return 'dueno';
  if (valor === 'administrador' || valor === 'admin') return 'administrador';
  return 'empleado';
};

router.get('/me', authMiddleware, (req, res) => {
  res.json({ usuario: req.usuario });
});

// GET /api/usuarios — Lista todos los usuarios del comercio (solo admin/dueño)
router.get('/', authMiddleware, autorizarRoles('administrador', 'dueno'), async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;
  try {
    const result = await db.query(
      'SELECT id, nombre_usuario, rol, suscripcion_activa, created_at FROM usuarios WHERE comercio_id = $1 ORDER BY nombre_usuario ASC',
      [comercioId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// DELETE /api/usuarios/:id — Eliminar empleado (solo admin/dueño, no puede eliminarse a sí mismo)
router.delete('/:id', authMiddleware, autorizarRoles('administrador', 'dueno'), async (req, res) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id || 1;
  if (parseInt(id) === req.usuario?.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
  }
  try {
    const result = await db.query(
      'DELETE FROM usuarios WHERE id = $1 AND comercio_id = $2 RETURNING id, nombre_usuario',
      [id, comercioId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ mensaje: `Usuario '${result.rows[0].nombre_usuario}' eliminado` });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ error: 'Error al eliminar usuario', detalle: error.message });
  }
});

router.post('/suscripcion', authMiddleware, autorizarRoles('administrador', 'dueno'), async (req, res) => {
  const { activa, hasta } = req.body;
  const suscripcionActiva = activa === true || activa === 'true' || activa === 1 || activa === '1';
  const fecha = hasta ? new Date(hasta) : null;
  const fechaParaGuardar = fecha && !Number.isNaN(fecha.getTime()) ? fecha.toISOString() : null;
  const comercioId = req.usuario.comercio_id || 1;

  try {
    const result = await db.query(
      'UPDATE comercios SET suscripcion_activa = $1, activo_hasta = $2 WHERE id = $3 RETURNING id, nombre, activo, suscripcion_activa, activo_hasta',
      [suscripcionActiva, fechaParaGuardar, comercioId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Comercio no encontrado' });
    }

    const comercio = result.rows[0];
    return res.json({
      mensaje: 'Suscripción del comercio actualizada correctamente',
      comercio,
    });
  } catch (error) {
    console.error('Error actualizando suscripción:', error);
    return res.status(500).json({ error: 'No se pudo actualizar la suscripción', detalle: error.message });
  }
});

router.post('/registro', autorizarRoles('administrador', 'dueno'), async (req, res) => {
  const { nombre_usuario, password, rol } = req.body;
  const rolNormalizado = normalizarRol(rol);

  if (!nombre_usuario || !password) {
    return res.status(400).json({ error: 'Nombre de usuario y contraseña son obligatorios' });
  }

  try {
    const passwordEncriptada = bcrypt.hashSync(password, 10);
    const comercioId = req.body.comercio_id || 1;

    const result = await db.query(
      'INSERT INTO usuarios (nombre_usuario, password, rol, suscripcion_activa, comercio_id) VALUES ($1, $2, $3, TRUE, $4) RETURNING id, nombre_usuario, rol, comercio_id',
      [nombre_usuario, passwordEncriptada, rolNormalizado, comercioId]
    );

    return res.status(201).json({
      mensaje: 'Usuario registrado exitosamente',
      usuario: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }
    console.error('Error registrando usuario:', error);
    return res.status(500).json({ error: 'Error al registrar usuario', detalle: error.message });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  const { nombre_usuario, password } = req.body;

  if (!nombre_usuario || !password) {
    return res.status(400).json({ error: 'Nombre de usuario y contraseña son obligatorios' });
  }

  try {
    // BUG-09 FIX: JOIN con comercios para verificar suscripción en el momento del login
    const result = await db.query(
      `SELECT u.id, u.nombre_usuario, u.password, u.rol, u.comercio_id,
              c.suscripcion_activa, c.activo_hasta
       FROM usuarios u
       JOIN comercios c ON u.comercio_id = c.id
       WHERE u.nombre_usuario = $1`,
      [nombre_usuario]
    );
    const usuario = result.rows[0];

    if (!usuario) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    const passwordValida = bcrypt.compareSync(password, usuario.password);
    if (!passwordValida) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    // BUG-09 FIX: Verificar suscripción antes de emitir el token
    const hoyStr = new Date().toISOString().slice(0, 10);
    const activoHastaStr = usuario.activo_hasta
      ? new Date(usuario.activo_hasta).toISOString().slice(0, 10)
      : null;
    const vencida = activoHastaStr && activoHastaStr < hoyStr;
    const suscripcionActiva = usuario.suscripcion_activa !== false && usuario.suscripcion_activa !== 0;

    if (!suscripcionActiva || vencida) {
      return res.status(403).json({ error: 'La suscripción del comercio está inactiva o vencida. Contactá a soporte.' });
    }

    const token = jwt.sign({ id: usuario.id, rol: usuario.rol, comercio_id: usuario.comercio_id }, JWT_SECRET, {
      expiresIn: '8h',
    });

    await registrarAuditoria({
      tipo_evento: 'LOGIN',
      descripcion: `El usuario '${usuario.nombre_usuario}' inició sesión.`,
      usuario_id: usuario.id,
      comercio_id: usuario.comercio_id
    });

    return res.json({
      mensaje: 'Inicio de sesión exitoso',
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre_usuario,
        rol: usuario.rol,
        comercio_id: usuario.comercio_id,
      },
    });
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({ error: 'Error en la base de datos', detalle: error.message });
  }
});

module.exports = router;
