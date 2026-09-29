const path = require('path');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const { pool } = require(path.join(__dirname, '../../backend/db/pgConexion'));
const bcrypt = require(path.join(__dirname, '../../backend/node_modules/bcryptjs'));

async function seedTestUser() {
  try {
    const passwordHash = await bcrypt.hash('admin123', 10);
    await pool.query(
      `UPDATE usuarios 
       SET password = $1, rol = 'administrador', pin_supervisor = '9999', suscripcion_activa = TRUE 
       WHERE nombre_usuario = 'fran'`,
      [passwordHash]
    );

    await pool.query(
      `UPDATE comercios 
       SET suscripcion_activa = TRUE, activo_hasta = (NOW() + INTERVAL '1 year') 
       WHERE id = 1`
    );

    console.log('✅ Usuario de prueba fran / admin123 configurado correctamente.');
  } catch (err) {
    console.error('Error configurando usuario de prueba:', err);
  } finally {
    process.exit(0);
  }
}

seedTestUser();
