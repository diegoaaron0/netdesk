CREATE TYPE "public"."tipo_decision" AS ENUM('CAMBIO_PROVEEDOR', 'RENEGOCIACION_CONTRATO', 'ACTIVACION_CONTINGENCIA', 'REVISION_SLA', 'BAJA_TIENDA', 'CAMBIO_PLAN', 'AUDITORIA_PROVEEDOR', 'OTRO');--> statement-breakpoint
CREATE TYPE "public"."estado_decision" AS ENUM('PENDIENTE', 'EN_EJECUCION', 'EJECUTADA', 'CANCELADA');--> statement-breakpoint
CREATE TABLE "decisiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_decision" NOT NULL,
	"titulo" text NOT NULL,
	"descripcion" text,
	"motivo" text NOT NULL,
	"estado" "estado_decision" DEFAULT 'PENDIENTE',
	"tienda_id" uuid,
	"proveedor_id" uuid,
	"responsable_id" uuid NOT NULL,
	"fecha_seguimiento" date,
	"snap_sla_pct" numeric,
	"snap_mttr_minutos" integer,
	"snap_iei" numeric,
	"snap_incidentes" integer,
	"snap_periodo" text,
	"ejecutada_en" timestamp,
	"resultado_nota" text,
	"post_sla_pct" numeric,
	"post_mttr_minutos" integer,
	"post_iei" numeric,
	"post_incidentes" integer,
	"creado_en" timestamp DEFAULT now(),
	"actualizado_en" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "decisiones" ADD CONSTRAINT "decisiones_tienda_id_tiendas_id_fk" FOREIGN KEY ("tienda_id") REFERENCES "public"."tiendas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisiones" ADD CONSTRAINT "decisiones_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisiones" ADD CONSTRAINT "decisiones_responsable_id_usuarios_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;
