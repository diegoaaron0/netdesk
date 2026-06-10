-- Migration 0024: Seed de Fichas
-- Crea una Ficha ACTIVA por cada tienda que tenga proveedor asignado.
-- Copia datos de conectividad desde tiendas y niveles desde niveles_escalamiento.
-- Actualiza tiendas.ficha_activa_id e incidentes.ficha_id.
-- Seguro de re-ejecutar: solo actúa sobre tiendas sin ficha_activa_id.

-- ── 1. Crear fichas para tiendas con proveedor ────────────────────────────────
WITH numbered AS (
  SELECT
    t.id                   AS tienda_id,
    t.codigo               AS tienda_codigo,
    t.proveedor_id,
    t.tipo_conexion,
    t.cid_servicio,
    t.velocidad,
    t.plan_aplicado,
    t.vigencia_contrato,
    COALESCE(t.estado_servicio, 'ACTIVO') AS estado_servicio,
    t.fecha_alta_servicio,
    t.descripcion_servicio,
    t.observacion,
    t.costo_mensual,
    ROW_NUMBER() OVER (ORDER BY t.codigo) AS rn
  FROM tiendas t
  WHERE t.proveedor_id IS NOT NULL
    AND t.ficha_activa_id IS NULL   -- solo si no tiene ficha aún
),
inserted AS (
  INSERT INTO fichas (
    codigo,
    tienda_id,
    proveedor_id,
    estado,
    tipo_conexion,
    cid_servicio,
    velocidad,
    plan_aplicado,
    vigencia_contrato,
    estado_servicio,
    fecha_alta_servicio,
    descripcion_servicio,
    observacion,
    costo_mensual,
    activado_en,
    creado_en
  )
  SELECT
    'FC-' || LPAD(rn::TEXT, 3, '0') || '-' || tienda_codigo,
    tienda_id,
    proveedor_id,
    'ACTIVA',
    tipo_conexion,
    cid_servicio,
    velocidad,
    plan_aplicado,
    vigencia_contrato,
    estado_servicio,
    fecha_alta_servicio,
    descripcion_servicio,
    observacion,
    costo_mensual,
    NOW(),
    NOW()
  FROM numbered
  RETURNING id, tienda_id
)
-- ── 2. Actualizar tiendas.ficha_activa_id ─────────────────────────────────────
UPDATE tiendas t
SET ficha_activa_id = ins.id
FROM inserted ins
WHERE t.id = ins.tienda_id;

-- ── 3. Copiar niveles de escalamiento del proveedor a cada ficha ──────────────
INSERT INTO fichas_niveles (
  ficha_id,
  nivel,
  nombre_contacto,
  email,
  celular,
  tiempo_resp_sev1,
  tiempo_resp_sev2,
  tiempo_resp_sev3,
  correos_copia,
  whatsapp,
  canal,
  horario_atencion,
  tiempo_esperado_solucion,
  instruccion,
  activo,
  creado_en
)
SELECT
  f.id,
  ne.nivel,
  ne.nombre_contacto,
  ne.email,
  ne.celular,
  ne.tiempo_resp_sev1,
  ne.tiempo_resp_sev2,
  ne.tiempo_resp_sev3,
  ne.correos_copia,
  ne.whatsapp,
  ne.canal,
  ne.horario_atencion,
  ne.tiempo_esperado_solucion,
  ne.instruccion,
  ne.activo,
  NOW()
FROM fichas f
JOIN niveles_escalamiento ne ON ne.proveedor_id = f.proveedor_id
WHERE f.estado = 'ACTIVA'
  AND NOT EXISTS (
    SELECT 1 FROM fichas_niveles fn WHERE fn.ficha_id = f.id
  );

-- ── 4. Vincular incidentes existentes a la ficha de su tienda ─────────────────
UPDATE incidentes i
SET ficha_id = t.ficha_activa_id
FROM tiendas t
WHERE i.tienda_id = t.id
  AND t.ficha_activa_id IS NOT NULL
  AND i.ficha_id IS NULL;
