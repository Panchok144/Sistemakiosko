const { query, getClient } = require('./pgConexion');

const prepareSql = (sql, params = []) => {
  if (!params || params.length === 0) {
    return { text: sql, values: [] };
  }

  let index = 0;
  const text = sql.replace(/\?/g, () => `$${++index}`);
  return { text, values: params };
};

const run = (sql, params, callback) => {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  const { text, values } = prepareSql(sql, params || []);

  return query(text, values)
    .then((res) => {
      if (callback) {
        callback.call(
          {
            lastID: res.rows?.[0]?.id ?? null,
            changes: res.rowCount,
          },
          null,
          res
        );
      }
      return res;
    })
    .catch((err) => {
      if (callback) {
        callback(err);
        return;
      }
      throw err;
    });
};

const get = (sql, params, callback) => {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  const { text, values } = prepareSql(sql, params || []);

  return query(text, values)
    .then((res) => {
      if (callback) callback(null, res.rows[0] ?? null);
      return res.rows[0] ?? null;
    })
    .catch((err) => {
      if (callback) {
        callback(err);
        return;
      }
      throw err;
    });
};

const all = (sql, params, callback) => {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  const { text, values } = prepareSql(sql, params || []);

  return query(text, values)
    .then((res) => {
      if (callback) callback(null, res.rows);
      return res.rows;
    })
    .catch((err) => {
      if (callback) {
        callback(err);
        return;
      }
      throw err;
    });
};

const transaction = async (handler) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  run,
  get,
  all,
  query,
  transaction,
};
