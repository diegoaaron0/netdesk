import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import ExcelJS from 'exceljs'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'reportes.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  try {
    const { searchParams } = new URL(req.url)
    const desde  = searchParams.get('desde') ?? new Date(Date.now() - 30 * 86400000).toISOString()
    const hasta  = searchParams.get('hasta') ?? new Date().toISOString()
    const estado = searchParams.get('estado') ?? ''

    const rows = await db.execute(sql`
      SELECT
        i.codigo,
        i.ticket_invgate,
        i.ticket_proveedor,
        COALESCE(t.nombre_cc, t.codigo)                                               AS tienda,
        COALESCE(t.distrito, '')                                                       AS ubicacion,
        COALESCE(pi.nombre, pt.nombre)                                                 AS proveedor,
        t.cid_servicio,
        t.tipo_conexion,
        t.cluster,
        i.nivel_impacto,
        i.tipo                                                                         AS tipo_incidente,
        i.usuarios_afectados,
        esc_max.nivel_max                                                              AS nivel_escalado,
        i.tipo_operacion_manual                                                        AS factor_operativo,
        CASE WHEN COALESCE(t.tiene_contingencia, false) THEN 'Sí' ELSE 'No' END      AS tiene_contingencia,
        TO_CHAR(i.hora_registro AT TIME ZONE 'America/Lima', 'HH24:MI DD/MM/YYYY')    AS hora_inicio,
        CASE
          WHEN i.mttr_minutos IS NULL THEN ''
          WHEN i.mttr_minutos < 60    THEN i.mttr_minutos::text || 'm'
          ELSE FLOOR(i.mttr_minutos / 60)::text || 'h ' || (i.mttr_minutos % 60)::text || 'm'
        END                                                                            AS tiempo_total_mttr,
        n1.enviado                                                                     AS enviado_n1,
        n1.respuesta                                                                   AS respuesta_n1,
        n2.enviado                                                                     AS enviado_n2,
        n2.respuesta                                                                   AS respuesta_n2,
        n3.enviado                                                                     AS enviado_n3,
        n3.respuesta                                                                   AS respuesta_n3,
        TO_CHAR(i.hora_fin AT TIME ZONE 'America/Lima', 'HH24:MI DD/MM/YYYY')         AS hora_solucion,
        i.observaciones                                                                AS comentarios,
        COALESCE(i.cont_rendimiento, i.mov_rendimiento)                               AS efectividad_contingencia,
        i.mttr_minutos                                                                 AS mttr_min,

        CASE
          WHEN n1.hora_envio_raw IS NULL OR n1.hora_respuesta_raw IS NULL
            THEN 'No escalado'
          WHEN EXTRACT(EPOCH FROM (n1.hora_respuesta_raw - n1.hora_envio_raw)) / 60 <= 60
            THEN 'Cumplido'
          ELSE 'Incumplido'
        END                                                                            AS sla_respuesta,

        CASE
          WHEN i.estado != 'RESUELTO' OR i.mttr_minutos IS NULL
            THEN 'No aplica'
          WHEN i.mttr_minutos <= CASE i.tipo
              WHEN 'CAIDA_TOTAL'   THEN 60
              WHEN 'INTERMITENCIA' THEN 120
              WHEN 'LENTITUD'      THEN 240
              WHEN 'POS'           THEN 60
              ELSE 120
            END
            THEN 'Cumplido'
          ELSE 'Incumplido'
        END                                                                            AS sla_resolucion,

        CASE
          WHEN i.evaluable_proveedor = false
            THEN 'No evaluable'
          WHEN i.estado != 'RESUELTO' OR i.mttr_minutos IS NULL
            THEN 'Pendiente'
          WHEN (
            n1.hora_envio_raw IS NOT NULL
            AND n1.hora_respuesta_raw IS NOT NULL
            AND EXTRACT(EPOCH FROM (n1.hora_respuesta_raw - n1.hora_envio_raw)) / 60 <= 60
            AND i.mttr_minutos <= CASE i.tipo
                WHEN 'CAIDA_TOTAL'   THEN 60
                WHEN 'INTERMITENCIA' THEN 120
                WHEN 'LENTITUD'      THEN 240
                WHEN 'POS'           THEN 60
                ELSE 120
              END
          )
            THEN 'Sí'
          ELSE 'No'
        END                                                                            AS sla_cumplido,

        CASE
          WHEN i.mttr_minutos IS NULL THEN NULL
          ELSE ROUND(
            COALESCE(
              t.venta_hora_soles::numeric,
              CASE t.cluster
                WHEN 'A' THEN 931
                WHEN 'B' THEN 521
                WHEN 'C' THEN 348
                WHEN 'D' THEN 197
                ELSE NULL
              END::numeric
            )
            * (i.mttr_minutos::numeric / 60)
            * 0.38
            * CASE i.tipo
                WHEN 'CAIDA_TOTAL'
                  THEN CASE WHEN COALESCE(t.contingencia_activa, false) THEN 0.25 ELSE 1.00 END
                WHEN 'INTERMITENCIA'
                  THEN CASE WHEN COALESCE(t.contingencia_activa, false) THEN 0.25 ELSE 0.75 END
                WHEN 'LENTITUD'      THEN 0.30
                WHEN 'POS'
                  THEN CASE WHEN COALESCE(t.contingencia_activa, false) THEN 0.20 ELSE 0.40 END
                ELSE 0.30
              END::numeric
          )
        END                                                                            AS iei,

        t.venta_hora_soles                                                             AS venta_hora_tienda

      FROM incidentes i
      JOIN    tiendas      t   ON i.tienda_id         = t.id
      LEFT JOIN proveedores  pi  ON i.proveedor_id    = pi.id
      LEFT JOIN proveedores  pt  ON t.proveedor_id    = pt.id
      LEFT JOIN usuarios     u   ON i.registrado_por_id = u.id

      LEFT JOIN LATERAL (
        SELECT MAX(e.nivel) AS nivel_max
        FROM escalamientos e
        WHERE e.incidente_id = i.id
      ) esc_max ON true

      LEFT JOIN LATERAL (
        SELECT
          TO_CHAR(MIN(e.hora_envio_correo) AT TIME ZONE 'America/Lima', 'HH24:MI DD/MM/YYYY') AS enviado,
          TO_CHAR(MIN(e.hora_respuesta)    AT TIME ZONE 'America/Lima', 'HH24:MI DD/MM/YYYY') AS respuesta,
          MIN(e.hora_envio_correo)                                                              AS hora_envio_raw,
          MIN(e.hora_respuesta)                                                                 AS hora_respuesta_raw
        FROM escalamientos e
        WHERE e.incidente_id = i.id AND e.nivel = 1
      ) n1 ON true

      LEFT JOIN LATERAL (
        SELECT
          TO_CHAR(MIN(e.hora_envio_correo) AT TIME ZONE 'America/Lima', 'HH24:MI DD/MM/YYYY') AS enviado,
          TO_CHAR(MIN(e.hora_respuesta)    AT TIME ZONE 'America/Lima', 'HH24:MI DD/MM/YYYY') AS respuesta
        FROM escalamientos e
        WHERE e.incidente_id = i.id AND e.nivel = 2
      ) n2 ON true

      LEFT JOIN LATERAL (
        SELECT
          TO_CHAR(MIN(e.hora_envio_correo) AT TIME ZONE 'America/Lima', 'HH24:MI DD/MM/YYYY') AS enviado,
          TO_CHAR(MIN(e.hora_respuesta)    AT TIME ZONE 'America/Lima', 'HH24:MI DD/MM/YYYY') AS respuesta
        FROM escalamientos e
        WHERE e.incidente_id = i.id AND e.nivel = 3
      ) n3 ON true

      WHERE i.hora_registro >= ${desde}::timestamptz
        AND i.hora_registro <  ${hasta}::timestamptz
        ${estado ? sql`AND i.estado = ${estado}` : sql``}
      ORDER BY i.hora_registro DESC
    `)

    // ── Columnas ──────────────────────────────────────────────────────────────
    const columns: { header: string; key: string; width: number }[] = [
      { header: 'Código',             key: 'codigo',                  width: 12 },
      { header: 'Ticket InvGate',     key: 'ticket_invgate',          width: 16 },
      { header: 'Ticket Proveedor',   key: 'ticket_proveedor',        width: 18 },
      { header: 'Tienda',             key: 'tienda',                  width: 28 },
      { header: 'Ubicación',          key: 'ubicacion',               width: 18 },
      { header: 'Proveedor',          key: 'proveedor',               width: 14 },
      { header: 'CID',                key: 'cid_servicio',            width: 20 },
      { header: 'Tipo Conexión',      key: 'tipo_conexion',           width: 16 },
      { header: 'Cluster',            key: 'cluster',                 width: 10 },
      { header: 'Nivel Impacto',      key: 'nivel_impacto',           width: 14 },
      { header: 'Tipo Incidente',     key: 'tipo_incidente',          width: 18 },
      { header: 'Usuarios Afectados', key: 'usuarios_afectados',      width: 10 },
      { header: 'Nivel Escalado',     key: 'nivel_escalado',          width: 10 },
      { header: 'Factor Operativo',   key: 'factor_operativo',        width: 18 },
      { header: 'Tiene Contingencia', key: 'tiene_contingencia',      width: 14 },
      { header: 'Hora Inicio',        key: 'hora_inicio',             width: 18 },
      { header: 'Tiempo Total',       key: 'tiempo_total_mttr',       width: 14 },
      { header: 'Enviado N1',         key: 'enviado_n1',              width: 18 },
      { header: 'Respuesta N1',       key: 'respuesta_n1',            width: 18 },
      { header: 'Enviado N2',         key: 'enviado_n2',              width: 18 },
      { header: 'Respuesta N2',       key: 'respuesta_n2',            width: 18 },
      { header: 'Enviado N3',         key: 'enviado_n3',              width: 18 },
      { header: 'Respuesta N3',       key: 'respuesta_n3',            width: 18 },
      { header: 'Hora Solución',      key: 'hora_solucion',           width: 18 },
      { header: 'Comentarios',        key: 'comentarios',             width: 40 },
      { header: 'Efectividad',        key: 'efectividad_contingencia',width: 14 },
      { header: 'MTTR min',           key: 'mttr_min',                width: 10 },
      { header: 'SLA Respuesta',      key: 'sla_respuesta',           width: 14 },
      { header: 'SLA Resolución',     key: 'sla_resolucion',          width: 14 },
      { header: 'SLA Cumplido',       key: 'sla_cumplido',            width: 12 },
      { header: 'IEI S/',             key: 'iei',                     width: 12 },
      { header: 'Venta/Hora',         key: 'venta_hora_tienda',       width: 12 },
    ]

    // Índices (1-based) de columnas numéricas y SLA para alineación centrada
    const centeredCols = new Set([9, 10, 12, 13, 27, 28, 29, 30, 31, 32])
    const slaCumplidoIdx = 30 // columna SLA Cumplido
    const ieiIdx         = 31
    const mttrIdx        = 27

    // ── Workbook ──────────────────────────────────────────────────────────────
    const workbook  = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Incidentes Operativos')

    worksheet.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width }))

    // ── Fila de encabezado ────────────────────────────────────────────────────
    const headerRow = worksheet.getRow(1)
    headerRow.height = 32
    headerRow.eachCell((cell, colNumber) => {
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
      cell.font   = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FF9BB2CC' } },
      }
    })

    // ── Auto-filter y freeze ──────────────────────────────────────────────────
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to:   { row: 1, column: columns.length },
    }
    worksheet.views = [{ state: 'frozen', ySplit: 1 }]

    // ── Filas de datos ────────────────────────────────────────────────────────
    const dataRows = rows as any[]
    dataRows.forEach((r, idx) => {
      const rowNum  = idx + 2
      const isEven  = rowNum % 2 === 0
      const bgArgb  = isEven ? 'FFF0F4F8' : 'FFFFFFFF'

      const values = columns.map(c => {
        const v = r[c.key]
        if (v === null || v === undefined) return ''
        return v
      })

      const row = worksheet.addRow(values)
      row.height = 20

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font      = { name: 'Arial', size: 10 }
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } }
        cell.alignment = centeredCols.has(colNumber)
          ? { vertical: 'middle', horizontal: 'center' }
          : { vertical: 'middle' }

        // SLA Cumplido: color condicional
        if (colNumber === slaCumplidoIdx) {
          const val = String(cell.value ?? '')
          if (val === 'Sí') {
            cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1D6F42' } }
          } else if (val === 'No') {
            cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFC00000' } }
          }
        }

        // IEI: formato número con separador de miles
        if (colNumber === ieiIdx && cell.value !== '') {
          const num = Number(cell.value)
          if (!isNaN(num)) {
            cell.value      = num
            cell.numFmt     = '#,##0'
            cell.alignment  = { vertical: 'middle', horizontal: 'center' }
          }
        }

        // MTTR min: entero
        if (colNumber === mttrIdx && cell.value !== '') {
          const num = Number(cell.value)
          if (!isNaN(num)) {
            cell.value  = num
            cell.numFmt = '0'
          }
        }
      })
    })

    // ── Serializar ────────────────────────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer()

    const desdeLabel = desde.slice(0, 10)
    const hastaLabel = hasta.slice(0, 10)

    return new NextResponse(buffer as unknown as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="netdesk_incidentes_operativos_${desdeLabel}_${hastaLabel}.xlsx"`,
      },
    })
  } catch (err: any) {
    console.error('[export-excel] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
