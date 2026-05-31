-- ============================================================
-- MIGRACIÓN: Ventas por hora L-J / V-D + venta mensual
-- Fuente: CSV análisis ene-abr 2026 (141 tiendas con data)
-- Ejecutar en Railway (envolver en CTE si la UI agrega LIMIT)
-- ============================================================

-- PASO 1: Agregar columnas nuevas
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS venta_hora_fds_soles NUMERIC;
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS venta_mensual_soles   NUMERIC;
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS proporcion_fds        NUMERIC;
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS usa_fallback_ventas   BOOLEAN DEFAULT FALSE;

-- PASO 2: Poblar tiendas con data del CSV
-- proporcion_fds = (vd*36) / (lj*48 + vd*36)  calculado inline
-- cluster se actualiza con el asignado por el análisis de ventas
WITH ventas_data AS (
  SELECT * FROM (VALUES
    ('T43',  676593.24, 1455.98, 2395.83, 'A', false),
    ('TP8',  433659.32,  968.70, 1488.26, 'A', false),
    ('TG3',  424113.12,  940.75, 1464.35, 'A', false),
    ('TC1',  403623.48,  848.15, 1456.47, 'A', false),
    ('TC6',  385643.58,  822.69, 1375.16, 'A', false),
    ('TC7',  380245.17,  795.92, 1376.25, 'A', false),
    ('T14',  344448.17,  849.47, 1075.37, 'A', false),
    ('TD4',  342076.12,  734.08, 1214.02, 'A', false),
    ('T02',  333430.76,  747.78, 1140.33, 'A', false),
    ('T79',  302759.28,  680.09, 1033.98, 'A', false),
    ('T85',  293645.06,  632.46, 1039.06, 'A', false),
    ('TD9',  290263.79,  675.22,  960.37, 'A', false),
    ('TG4',  266579.03,  576.39,  940.32, 'A', false),
    ('T92',  243151.34,  553.14,  821.15, 'A', false),
    ('T70',  235632.54,  512.35,  827.33, 'A', false),
    ('TL8',  232474.66,  457.84,  879.77, 'A', false),
    ('TF6',  232064.47,  478.37,  849.77, 'A', false),
    ('TF7',  228267.80,  480.85,  822.12, 'A', false),
    ('TC8',  224918.91,  489.72,  788.83, 'A', false),
    ('TG2',  220032.26,  456.75,  801.47, 'A', false),
    ('T84',  219069.73,  435.63,  823.45, 'A', false),
    ('TF8',  218974.80,  463.97,  785.05, 'A', false),
    ('T78',  217763.51,  538.11,  678.44, 'A', false),
    ('TH2',  216768.14,  487.76,  739.20, 'A', false),
    ('TM9',  210416.71,  443.40,  757.63, 'A', false),
    ('T72',  209728.91,  460.77,  730.05, 'A', false),
    ('TE6',  207358.36,  478.55,  691.15, 'A', false),
    ('T74',  206971.94,  447.27,  730.39, 'A', false),
    ('T42',  205275.92,  451.10,  714.40, 'A', false),
    ('TI1',  198103.20,  515.82,  582.13, 'A', false),
    ('T41',  197854.57,  458.08,  657.52, 'A', false),
    ('TH1',  194521.79,  450.78,  645.89, 'A', false),
    ('TC5',  191476.14,  419.83,  667.64, 'A', false),
    ('T95',  190489.93,  439.03,  635.71, 'A', false),
    ('TF5',  188906.03,  376.15,  709.41, 'A', false),
    ('TD2',  188170.97,  424.88,  639.71, 'B', false),
    ('T59',  186433.78,  466.56,  573.01, 'B', false),
    ('TG5',  186422.87,  420.48,  634.38, 'B', false),
    ('TM1',  185830.99,  389.00,  672.56, 'B', false),
    ('TE3',  182990.42,  395.28,  645.97, 'B', false),
    ('TE7',  182909.20,  388.30,  654.76, 'B', false),
    ('TN1',  177682.48,  389.30,  619.93, 'B', false),
    ('TL9',  176561.54,  351.07,  663.71, 'B', false),
    ('T87',  175826.15,  377.66,  623.55, 'B', false),
    ('T20',  175250.52,  463.73,  505.10, 'B', false),
    ('TC2',  175134.46,  364.11,  637.18, 'B', false),
    ('TG6',  174674.37,  377.73,  616.06, 'B', false),
    ('TO3',  171865.02,  391.57,  579.61, 'B', false),
    ('T10',  167024.00,  362.20,  587.73, 'B', false),
    ('T98',  166543.82,  355.98,  592.95, 'B', false),
    ('TC9',  163611.41,  358.92,  570.23, 'B', false),
    ('TG8',  161484.04,  350.40,  567.95, 'B', false),
    ('T46',  160692.01,  359.50,  550.74, 'B', false),
    ('TA7',  159058.38,  353.21,  548.65, 'B', false),
    ('TJ1',  157137.47,  415.69,  453.04, 'B', false),
    ('TJ4',  155839.14,  345.80,  537.90, 'B', false),
    ('TP4',  155471.67,  364.65,  510.41, 'B', false),
    ('TE8',  154890.24,  323.20,  561.95, 'B', false),
    ('TO2',  154113.47,  348.55,  523.18, 'B', false),
    ('TJ8',  151957.62,  364.80,  487.68, 'B', false),
    ('TD7',  151206.69,  310.33,  555.49, 'B', false),
    ('TL4',  148229.63,  346.85,  487.73, 'B', false),
    ('TJ6',  145617.58,  319.80,  507.05, 'B', false),
    ('TK5',  143923.05,  295.69,  528.33, 'B', false),
    ('T90',  143304.58,  287.79,  534.90, 'B', false),
    ('T89',  143049.06,  318.73,  492.01, 'B', false),
    ('TF9',  142464.99,  285.82,  532.15, 'B', false),
    ('TP5',  142282.54,  320.02,  485.38, 'B', false),
    ('TI9',  142215.53,  321.77,  482.62, 'B', false),
    ('T81',  139861.12,  293.00,  505.89, 'B', false),
    ('TA9',  139320.18,  332.33,  449.97, 'C', false),
    ('T40',  137860.85,  290.35,  496.59, 'C', false),
    ('TH7',  135188.70,  324.47,  433.97, 'C', false),
    ('T83',  133889.85,  286.76,  475.93, 'C', false),
    ('TL1',  133864.24,  292.14,  468.59, 'C', false),
    ('TA2',  130520.50,  276.07,  468.58, 'C', false),
    ('TH6',  127800.86,  275.67,  451.67, 'C', false),
    ('TJ3',  125995.23,  286.52,  425.64, 'C', false),
    ('T91',  122631.69,  267.03,  430.06, 'C', false),
    ('T25',  121651.82,  266.70,  424.21, 'C', false),
    ('T93',  119322.31,  257.26,  421.88, 'C', false),
    ('TP3',  118004.53,  267.72,  399.48, 'C', false),
    ('TI4',  117767.34,  265.27,  401.22, 'C', false),
    ('TN9',  116353.99,  265.84,  391.40, 'C', false),
    ('T71',  115373.24,  254.22,  400.62, 'C', false),
    ('T57',  113062.57,  242.21,  401.81, 'C', false),
    ('T32',  112952.05,  240.96,  402.78, 'C', false),
    ('TH5',  112471.44,  223.39,  423.11, 'C', false),
    ('TH8',  111704.19,  304.35,  310.25, 'C', false),
    ('TL3',  109667.61,  249.90,  369.80, 'C', false),
    ('TQ1',  108226.26,  179.30,  454.70, 'C', false),
    ('TD8',  107841.46,  300.78,  290.25, 'C', false),
    ('TL2',  107763.95,  278.20,  319.86, 'C', false),
    ('TM4',  107101.81,  257.52,  343.19, 'C', false),
    ('TN8',  107097.01,  236.48,  371.21, 'C', false),
    ('TO7',  106311.24,  214.78,  395.10, 'C', false),
    ('TI5',  106250.79,  238.77,  362.74, 'C', false),
    ('TI2',  105549.96,  299.26,  277.59, 'C', false),
    ('TH4',  104516.81,  214.91,  383.44, 'C', false),
    ('T66',  102718.21,  237.89,  341.26, 'C', false),
    ('TI8',  101752.84,  224.97,  352.30, 'C', false),
    ('TJ5',  101617.65,  254.17,  312.51, 'C', false),
    ('T31',  101511.52,  272.28,  287.67, 'C', false),
    ('TM8',  101142.51,  235.12,  334.85, 'C', false),
    ('T29',   97698.12,  270.23,  265.97, 'C', false),
    ('TD3',   96641.67,  221.95,  323.56, 'D', false),
    ('TO4',   95094.11,  215.37,  322.42, 'D', false),
    ('TK6',   92760.78,  207.67,  317.73, 'D', false),
    ('TI6',   92153.81,  217.02,  301.37, 'D', false),
    ('TL5',   91989.60,  193.86,  331.19, 'D', false),
    ('TH9',   89446.39,  179.41,  334.16, 'D', false),
    ('TK2',   89156.52,  196.76,  309.17, 'D', false),
    ('TH3',   88762.31,  187.22,  319.37, 'D', false),
    ('TL6',   81656.70,  189.85,  270.30, 'D', false),
    ('TO8',   75449.02,  177.06,  247.57, 'D', false),
    ('T28',   75331.56,  187.79,  232.51, 'D', false),
    ('TF2',   74638.70,  170.24,  251.46, 'D', false),
    ('TP1',   74183.67,  162.23,  259.24, 'D', false),
    ('T16',   73982.50,  165.48,  253.61, 'D', false),
    ('TK7',   73409.20,  166.28,  248.87, 'D', false),
    ('TP7',   73157.34,  155.85,  261.16, 'D', false),
    ('T12',   73123.62,  170.70,  241.15, 'D', false),
    ('TK1',   72756.27,  182.65,  222.85, 'D', false),
    ('TP2',   72343.26,  156.41,  255.19, 'D', false),
    ('TI7',   70785.36,  155.10,  246.95, 'D', false),
    ('TP6',   68469.32,  157.91,  228.36, 'D', false),
    ('TF4',   67709.04,  152.58,  230.59, 'D', true),
    ('TO9',   65312.35,  154.42,  212.77, 'D', false),
    ('T04',   64905.96,  147.96,  218.78, 'D', false),
    ('TN7',   64180.45,  147.89,  214.23, 'D', false),
    ('T39',   59769.56,  127.90,  212.60, 'D', false),
    ('TD1',   55840.17,  126.78,  188.91, 'D', false),
    ('TK8',   47206.25,  105.67,  161.71, 'D', false),
    ('T18',   47136.99,  108.88,  156.99, 'D', false),
    ('T08',   47097.99,  109.90,  155.37, 'D', false),
    ('TO5',   44796.52,  103.12,  149.66, 'D', false),
    ('TN6',   42875.18,   97.43,  144.93, 'D', false),
    ('TM7',   41719.28,   90.56,  146.68, 'D', false),
    ('TN5',   38970.74,   85.87,  135.32, 'D', false),
    ('TO1',   36138.26,   78.28,  127.28, 'D', false),
    ('TO6',   18574.89,   38.84,   67.29, 'D', false)
  ) AS v(codigo, vta_mensual, vta_hora_lj, vta_hora_vd, cluster_nuevo, es_fallback)
)
UPDATE tiendas t
SET
  venta_mensual_soles  = vd.vta_mensual,
  venta_hora_soles     = vd.vta_hora_lj,
  venta_hora_fds_soles = vd.vta_hora_vd,
  usa_fallback_ventas  = vd.es_fallback,
  cluster              = vd.cluster_nuevo::cluster_tienda,
  proporcion_fds       = ROUND(
    (vd.vta_hora_vd * 36.0) / NULLIF(vd.vta_hora_lj * 48.0 + vd.vta_hora_vd * 36.0, 0),
    6
  )
FROM ventas_data vd
WHERE t.codigo = vd.codigo;

-- PASO 3: Poblar tiendas SIN_DATA con promedios de su cluster
-- (solo las que ya tienen cluster asignado en la BD y no tienen venta_hora_soles aún)
UPDATE tiendas t
SET
  venta_hora_soles     = f.avg_lj,
  venta_hora_fds_soles = f.avg_vd,
  venta_mensual_soles  = f.avg_mensual,
  proporcion_fds       = f.avg_prop,
  usa_fallback_ventas  = true
FROM (
  SELECT
    cluster,
    AVG(venta_hora_soles)     FILTER (WHERE usa_fallback_ventas = false) AS avg_lj,
    AVG(venta_hora_fds_soles) FILTER (WHERE usa_fallback_ventas = false) AS avg_vd,
    AVG(venta_mensual_soles)  FILTER (WHERE usa_fallback_ventas = false) AS avg_mensual,
    AVG(proporcion_fds)       FILTER (WHERE usa_fallback_ventas = false) AS avg_prop
  FROM tiendas
  WHERE venta_hora_soles IS NOT NULL
    AND cluster IS NOT NULL
  GROUP BY cluster
) f
WHERE t.cluster = f.cluster
  AND t.venta_hora_soles IS NULL;

-- Verificar resultado
SELECT
  cluster,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE usa_fallback_ventas = false) AS con_data_propia,
  COUNT(*) FILTER (WHERE usa_fallback_ventas = true)  AS con_fallback,
  COUNT(*) FILTER (WHERE venta_hora_soles IS NULL)    AS sin_ventas,
  ROUND(AVG(venta_hora_soles)::numeric, 2)            AS avg_hora_lj,
  ROUND(AVG(venta_hora_fds_soles)::numeric, 2)        AS avg_hora_vd,
  ROUND(AVG(venta_mensual_soles)::numeric, 0)         AS avg_mensual
FROM tiendas
GROUP BY cluster
ORDER BY cluster NULLS LAST;
