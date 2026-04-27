CREATE TYPE "public"."cluster_tienda" AS ENUM('A', 'B', 'C', 'D');--> statement-breakpoint
CREATE TYPE "public"."estado_cronometro" AS ENUM('CORRIENDO', 'RESPONDIDO', 'VENCIDO');--> statement-breakpoint
CREATE TYPE "public"."estado_incidente" AS ENUM('ABIERTO', 'EN_SEGUIMIENTO', 'ESCALADO_N1', 'ESCALADO_N2', 'ESCALADO_N3', 'RESUELTO', 'CANCELADO', 'CERRADO');--> statement-breakpoint
CREATE TYPE "public"."nivel_impacto" AS ENUM('ALTO', 'MEDIO', 'BAJO');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('AGENTE', 'SUPERVISOR', 'GERENCIA');--> statement-breakpoint
CREATE TYPE "public"."tipo_incidente" AS ENUM('CAIDA_TOTAL', 'INTERMITENCIA', 'LENTITUD', 'POS', 'OTROS');--> statement-breakpoint
CREATE TABLE "adjuntos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text,
	"tamano_bytes" integer,
	"incidente_id" uuid,
	"escalamiento_id" uuid,
	"creado_en" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "escalamientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incidente_id" uuid NOT NULL,
	"nivel" integer NOT NULL,
	"nivel_esc_id" uuid,
	"contacto_escalado" text NOT NULL,
	"email_contacto" text NOT NULL,
	"hora_envio_correo" timestamp,
	"hora_respuesta" timestamp,
	"tiempo_respuesta_min" integer,
	"estado_cronometro" "estado_cronometro" DEFAULT 'CORRIENDO',
	"cuerpo_correo" text,
	"creado_en" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "incidentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"tienda_id" uuid NOT NULL,
	"registrado_por_id" uuid NOT NULL,
	"nivel_impacto" "nivel_impacto" NOT NULL,
	"usuarios_afectados" text,
	"tipo" "tipo_incidente" NOT NULL,
	"estado" "estado_incidente" DEFAULT 'ABIERTO' NOT NULL,
	"ticket_proveedor" text,
	"descartes_realizados" text,
	"solucion_aplicada" text,
	"hora_registro" timestamp DEFAULT now() NOT NULL,
	"hora_inicio_seguimiento" timestamp,
	"hora_fin" timestamp,
	"mttr_minutos" integer,
	"observaciones" text,
	"actualizado_en" timestamp DEFAULT now(),
	CONSTRAINT "incidentes_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "niveles_escalamiento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proveedor_id" uuid,
	"nivel" integer NOT NULL,
	"nombre_contacto" text NOT NULL,
	"email" text,
	"celular" text,
	"tiempo_resp_sev1" text,
	"tiempo_resp_sev2" text,
	"tiempo_resp_sev3" text
);
--> statement-breakpoint
CREATE TABLE "proveedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"correo_soporte" text,
	"telefono_soporte" text,
	"instruccion_general" text,
	"creado_en" timestamp DEFAULT now(),
	CONSTRAINT "proveedores_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "tiendas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre_cc" text,
	"formato" text,
	"direccion" text,
	"referencia" text,
	"distrito" text,
	"provincia" text,
	"ubicacion" text,
	"coordenadas" text,
	"cluster" "cluster_tienda",
	"supervisor_nombre" text,
	"proveedor_id" uuid,
	"tipo_conexion" text,
	"tipo_servicio" text,
	"cid_servicio" text,
	"tiene_contingencia" boolean DEFAULT false,
	"costo_mensual" numeric,
	"instruccion_reporte" text,
	"contacto_soporte" text,
	"administrador_nombre" text,
	"administrador_email" text,
	"administrador_celular" text,
	"creado_en" timestamp DEFAULT now(),
	CONSTRAINT "tiendas_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"email" text NOT NULL,
	"rol" "rol" DEFAULT 'AGENTE' NOT NULL,
	"cluster" "cluster_tienda",
	"activo" boolean DEFAULT true,
	"creado_en" timestamp DEFAULT now(),
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_incidente_id_incidentes_id_fk" FOREIGN KEY ("incidente_id") REFERENCES "public"."incidentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_escalamiento_id_escalamientos_id_fk" FOREIGN KEY ("escalamiento_id") REFERENCES "public"."escalamientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalamientos" ADD CONSTRAINT "escalamientos_incidente_id_incidentes_id_fk" FOREIGN KEY ("incidente_id") REFERENCES "public"."incidentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalamientos" ADD CONSTRAINT "escalamientos_nivel_esc_id_niveles_escalamiento_id_fk" FOREIGN KEY ("nivel_esc_id") REFERENCES "public"."niveles_escalamiento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidentes" ADD CONSTRAINT "incidentes_tienda_id_tiendas_id_fk" FOREIGN KEY ("tienda_id") REFERENCES "public"."tiendas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidentes" ADD CONSTRAINT "incidentes_registrado_por_id_usuarios_id_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "niveles_escalamiento" ADD CONSTRAINT "niveles_escalamiento_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiendas" ADD CONSTRAINT "tiendas_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE no action ON UPDATE no action;