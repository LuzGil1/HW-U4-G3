# HW-U4-G3 — Observabilidad de Base de Datos con Stack de Monitoreo

Base de Datos II
Stack completo de observabilidad con PostgreSQL, Prometheus, Grafana y Artillery.

---

## Requisitos del sistema

| Herramienta | Versión mínima | Notas |
|---|---|---|
| Docker Desktop | 24+ | Con WSL 2 habilitado en Windows |
| Docker Compose | v2+ | Incluido en Docker Desktop |
| Node.js | 18+ | Necesario para Artillery |
| Artillery | 2+ | `npm install -g artillery` |
| Git | cualquier | Para clonar el repositorio |

> Si se tiene PostgreSQL instalado localmente en el puerto 5432, se debe detener ese servicio antes de levantar el stack para evitar conflictos de puertos.

---

## Levantar el entorno desde cero

### 1. Clonar o descomprimir el proyecto

```bash
# Si se usa Git
git clone https://github.com/TU_USUARIO/HW-U4-G3.git
cd HW-U4-G3

# Si se recibe el ZIP
# Descomprimir y entrar a la carpeta
cd HW-U4-G3
```

### 2. Levantar todos los servicios

```bash
docker compose up --build -d
```

La primera vez tarda entre 15 y 30 minutos porque Docker inserta 5,000,000 de pedidos y 500,000 clientes en PostgreSQL. Esto es normal.

### 3. Verificar que todo está corriendo

```bash
docker compose ps
```

Todos los servicios deben aparecer como `running`. PostgreSQL debe mostrar `(healthy)`.

### 4. Verificar cada servicio

```bash
# API
curl http://localhost:8080/health
# Respuesta esperada: {"status":"ok","timestamp":"..."}
```

- Prometheus: http://localhost:9090/targets — el target `postgres` debe estar en estado **UP**
- Grafana: http://localhost:3000 — usuario `admin`, contraseña `admin`

---

## Servicios y puertos

| Servicio | Puerto | URL |
|---|---|---|
| API Node/Express | 8080 | http://localhost:8080 |
| PostgreSQL 16 | 5432 | — |
| postgres_exporter | 9187 | http://localhost:9187/metrics |
| Prometheus | 9090 | http://localhost:9090 |
| Grafana | 3000 | http://localhost:3000 |

---

## Endpoints de la API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Healthcheck |
| POST | `/pedidos` | Crear un nuevo pedido |
| GET | `/pedidos/:id` | Obtener pedido por ID |
| GET | `/pedidos?region=X&status=Y` | Listar pedidos (límite 50) |
| GET | `/pedidos/resumen?region=X` | Suma y conteo por región |
| PUT | `/pedidos/:id/status` | Actualizar status de un pedido |

---

## Ejecutar los experimentos

Antes de ejecutar cualquier experimento, se debe verificar que el stack está corriendo:

```bash
docker compose ps
```

---

### Experimento 1 — Impacto de índices en latencia de escritura

**Objetivo:** Comparar la latencia del endpoint `POST /pedidos` sin índices adicionales versus con índices excesivos, para cuantificar el overhead de escritura.

**Paso 1 — Verificar que solo existe la PK**

```bash
docker exec -it hw-u4-g3-postgres-1 psql -U postgres -d dbii_hw4
```

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'pedidos';
-- Debe mostrar solo: pedidos_pkey y pedidos_pedido_ref_key
\q
```

**Paso 2 — Ronda 1: sin índices adicionales**

```bash
artillery run artillery/load-test.yml --output artillery/results-no-index.json
artillery report artillery/results-no-index.json --output artillery/report-no-index.html
```

Se deben anotar los valores `p95` y `p99` del resumen final.

**Paso 3 — Captura de Grafana**

Se debe abrir http://localhost:3000 y tomar captura del dashboard durante o inmediatamente después de la carga.

**Paso 4 — Crear índices excesivos**

```bash
docker exec -it hw-u4-g3-postgres-1 psql -U postgres -d dbii_hw4
```

```sql
CREATE INDEX idx_excess_cliente  ON pedidos(cliente_id);
CREATE INDEX idx_excess_producto ON pedidos(producto_id);
CREATE INDEX idx_excess_canal    ON pedidos(canal);
CREATE INDEX idx_excess_status   ON pedidos(status);
\q
```

**Paso 5 — Ronda 2: con índices excesivos**

```bash
artillery run artillery/load-test.yml --output artillery/results-excess-indexes.json
artillery report artillery/results-excess-indexes.json --output artillery/report-excess-indexes.html
```

Se deben anotar los valores `p95` y `p99` y comparar con la Ronda 1.

**Paso 6 — Medir tamaño de heap e índices**

```bash
docker exec -it hw-u4-g3-postgres-1 psql -U postgres -d dbii_hw4
```

```sql
SELECT
  pg_size_pretty(pg_relation_size('pedidos'))  AS heap_size,
  pg_size_pretty(pg_indexes_size('pedidos'))   AS indexes_size;
\q
```

---

### Experimento 2 — Índice cubriente en el endpoint analítico

**Objetivo:** Demostrar que `GET /pedidos/resumen` se beneficia significativamente del índice cubriente, visible en latencia Artillery y en el panel Seq Scans vs Index Scans de Grafana.

**Paso 1 — Eliminar índices excesivos del experimento anterior**

```bash
docker exec -it hw-u4-g3-postgres-1 psql -U postgres -d dbii_hw4
```

```sql
DROP INDEX idx_excess_cliente, idx_excess_producto, idx_excess_canal, idx_excess_status;
\q
```

**Paso 2 — Ejecutar escenario sin índice cubriente**

```bash
artillery run artillery/load-test.yml --output artillery/results-analytical-no-index.json
```

**Paso 3 — EXPLAIN ANALYZE sin índice cubriente**

```bash
docker exec -it hw-u4-g3-postgres-1 psql -U postgres -d dbii_hw4
```

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT region, SUM(total), COUNT(*)
FROM pedidos
WHERE region = 'Norte'
AND status = 'completed'
GROUP BY region;
\q
```

Se debe anotar el tipo de scan y el tiempo de ejecución.

**Paso 4 — Crear el índice cubriente**

```bash
docker exec -it hw-u4-g3-postgres-1 psql -U postgres -d dbii_hw4
```

```sql
CREATE INDEX idx_pedidos_resumen_covering
    ON pedidos(region, status) INCLUDE (total);

ANALYZE pedidos;
\q
```

**Paso 5 — Repetir escenario con índice cubriente**

```bash
artillery run artillery/load-test.yml --output artillery/results-covering.json
artillery report artillery/results-covering.json --output artillery/report-covering.html
```

Se debe comparar con los resultados anteriores y tomar captura del panel **Seq Scans vs Index Scans** en Grafana.

**Paso 6 — EXPLAIN ANALYZE con índice cubriente**

```bash
docker exec -it hw-u4-g3-postgres-1 psql -U postgres -d dbii_hw4
```

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT region, SUM(total), COUNT(*)
FROM pedidos
WHERE region = 'Norte'
AND status = 'completed'
GROUP BY region;
\q
```

Se debe verificar que el plan muestre `Index Only Scan` con buffers mínimos.

---

### Experimento 3 — Dead tuples y VACUUM

**Objetivo:** Observar cómo crecen las dead tuples bajo carga de updates y cómo se recuperan después de VACUUM ANALYZE.

**Paso 1 — Confirmar índices correctos activos**

```bash
docker exec -it hw-u4-g3-postgres-1 psql -U postgres -d dbii_hw4
```

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'pedidos';
\q
```

**Paso 2 — Ejecutar la prueba de carga completa**

```bash
artillery run artillery/load-test.yml --output artillery/results-dead-tuples.json
```

**Paso 3 — Observar dead tuples en Grafana**

Durante la carga, se debe abrir http://localhost:3000 y observar el panel **Dead Tuples en pedidos**. Se debe tomar captura mostrando el crecimiento.

**Paso 4 — Ejecutar VACUUM**

```bash
docker exec -it hw-u4-g3-postgres-1 psql -U postgres -d dbii_hw4
```

```sql
VACUUM ANALYZE pedidos;
\q
```

**Paso 5 — Captura del ciclo completo**

Se debe observar en Grafana cómo el panel de dead tuples cae después del VACUUM y tomar captura mostrando el ciclo completo: crecimiento durante la carga y caída post-VACUUM.

---

## Comandos útiles

```bash
# Ver logs de un servicio
docker compose logs -f api
docker compose logs -f postgres

# Reiniciar un servicio
docker compose restart api

# Detener todo (conserva los datos)
docker compose down

# Detener todo y borrar los datos (reinicio completo)
docker compose down -v

# Conectarse a PostgreSQL
docker exec -it hw-u4-g3-postgres-1 psql -U postgres -d dbii_hw4
```

---

## Estructura del proyecto

```
HW-U4-G3/
  docker-compose.yml
  README.md
  api/
    index.js
    Dockerfile
    .dockerignore
    package.json
  postgres/
    init.sql
  prometheus/
    prometheus.yml
  grafana/
    provisioning/
      datasources/
        prometheus.yml
      dashboards/
        dashboard.yml
        dbii-u4.json
  artillery/
    load-test.yml
    results-no-index.json
    results-excess-indexes.json
    results-analytical-no-index.json
    results-covering.json
    results-dead-tuples.json
    report-no-index.html
    report-excess-indexes.html
    report-covering.html
  informe/
    HW-U4-G3.pdf
```