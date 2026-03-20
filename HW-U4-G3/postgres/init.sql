-- Habilitar pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Tabla de clientes
CREATE TABLE IF NOT EXISTS clientes (
    id              BIGSERIAL       PRIMARY KEY,
    nombre          VARCHAR(100)    NOT NULL,
    email           VARCHAR(150)    NOT NULL UNIQUE,
    region          VARCHAR(40)     NOT NULL,
    segmento        VARCHAR(30)     NOT NULL,
    activo          BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Tabla principal de pedidos
CREATE TABLE IF NOT EXISTS pedidos (
    id              BIGSERIAL       PRIMARY KEY,
    pedido_ref      VARCHAR(40)     NOT NULL UNIQUE,
    cliente_id      BIGINT          NOT NULL,
    producto_id     BIGINT          NOT NULL,
    categoria_id    INT             NOT NULL,
    region          VARCHAR(40)     NOT NULL,
    status          VARCHAR(20)     NOT NULL,
    cantidad        INT             NOT NULL DEFAULT 1,
    precio_unit     NUMERIC(10,2)   NOT NULL,
    total           NUMERIC(12,2)   NOT NULL,
    canal           VARCHAR(20)     NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);

-- Insertar 500,000 clientes
INSERT INTO clientes (nombre, email, region, segmento, activo, created_at)
SELECT
    'Cliente ' || i,
    'cliente' || i || '@mail.com',
    (ARRAY['Norte','Sur','Este','Oeste'])[1 + mod(i, 4)],
    (ARRAY['Premium','Regular','Basico'])[1 + mod(i, 3)],
    mod(i, 10) != 0,
    NOW() - (random() * interval '2 years')
FROM generate_series(1, 500000) AS i;

-- Insertar 5,000,000 de pedidos
INSERT INTO pedidos (
    pedido_ref, cliente_id, producto_id, categoria_id,
    region, status, cantidad, precio_unit, total, canal, created_at
)
SELECT
    'PED-' || i,
    1 + mod(i, 500000),
    1 + mod(i, 10000),
    1 + mod(i, 50),
    (ARRAY['Norte','Sur','Este','Oeste'])[1 + mod(i, 4)],
    (ARRAY['pending','completed','cancelled'])[1 + mod(i, 3)],
    1 + mod(i, 10),
    round((5 + random() * 495)::numeric, 2),
    round(((1 + mod(i, 10)) * (5 + random() * 495))::numeric, 2),
    (ARRAY['web','mobile','tienda'])[1 + mod(i, 3)],
    NOW() - (random() * interval '2 years')
FROM generate_series(1, 5000000) AS i;