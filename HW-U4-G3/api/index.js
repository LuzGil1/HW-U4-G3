const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ─── HEALTH ───────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ─── POST /pedidos ────────────────────────────────────────
app.post('/pedidos', async (req, res) => {
  const { cliente_id, producto_id, categoria_id,
          region, cantidad, precio_unit, canal } = req.body;

  const total     = cantidad * precio_unit;
  const pedidoRef = `PED-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const status    = 'pending';

  const sql = `
    INSERT INTO pedidos
      (pedido_ref, cliente_id, producto_id, categoria_id,
       region, status, cantidad, precio_unit, total, canal)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING id, pedido_ref, created_at
  `;

  const t0 = Date.now();
  try {
    const result = await pool.query(sql, [
      pedidoRef, cliente_id, producto_id, categoria_id,
      region, status, cantidad, precio_unit, total, canal
    ]);
    console.log(`[POST /pedidos] ${Date.now() - t0}ms`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /pedidos/resumen?region=X ───────────────────────
app.get('/pedidos/resumen', async (req, res) => {
  const { region } = req.query;

  if (!region) {
    return res.status(400).json({ error: 'region es requerida' });
  }

  const sql = `
    SELECT SUM(total)  AS revenue_total,
           COUNT(*)    AS num_pedidos,
           AVG(total)  AS avg_ticket
    FROM   pedidos
    WHERE  region = $1
      AND  status = 'completed'
  `;

  const t0 = Date.now();
  try {
    const result = await pool.query(sql, [region]);
    console.log(`[GET /pedidos/resumen] region=${region} ${Date.now() - t0}ms`);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /pedidos/:id ─────────────────────────────────────
app.get('/pedidos/:id', async (req, res) => {
  const { id } = req.params;

  const sql = `SELECT * FROM pedidos WHERE id = $1`;

  const t0 = Date.now();
  try {
    const result = await pool.query(sql, [id]);
    console.log(`[GET /pedidos/${id}] ${Date.now() - t0}ms`);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /pedidos?region=X&status=Y ──────────────────────
app.get('/pedidos', async (req, res) => {
  const { region, status } = req.query;

  if (!region || !status) {
    return res.status(400).json({ error: 'region y status son requeridos' });
  }

  const sql = `
    SELECT id, pedido_ref, cliente_id, region, status, total, created_at
    FROM   pedidos
    WHERE  region = $1
      AND  status = $2
    ORDER  BY created_at DESC
    LIMIT  50
  `;

  const t0 = Date.now();
  try {
    const result = await pool.query(sql, [region, status]);
    console.log(`[GET /pedidos] region=${region} status=${status} ${Date.now() - t0}ms`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /pedidos/:id/status ──────────────────────────────
app.put('/pedidos/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'status es requerido' });
  }

  const sql = `
    UPDATE pedidos
    SET    status     = $1,
           updated_at = NOW()
    WHERE  id = $2
    RETURNING id, pedido_ref, status, updated_at
  `;

  const t0 = Date.now();
  try {
    const result = await pool.query(sql, [status, id]);
    console.log(`[PUT /pedidos/${id}/status] ${Date.now() - t0}ms`);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`API corriendo en puerto ${PORT}`);
});