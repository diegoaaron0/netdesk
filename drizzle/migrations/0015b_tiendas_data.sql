-- =============================================================================
-- PASO 1: Aplicar migración de columnas nuevas (si no se hizo aún)
-- =============================================================================
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS gabinete boolean DEFAULT false;
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS vigencia_contrato text;
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS descripcion_servicio text;

-- =============================================================================
-- PASO 2: Actualizar datos de tiendas desde inventario CSV
-- =============================================================================
WITH upd AS (
  UPDATE tiendas AS t SET
    formato              = v.formato,
    nombre_cc            = v.nombre_cc,
    direccion            = v.direccion,
    distrito             = v.distrito,
    provincia            = v.provincia,
    tipo_conexion        = v.tipo_conexion,
    tiene_contingencia   = v.tiene_cont,
    cid_servicio         = NULLIF(v.cid, ''),
    descripcion_servicio = NULLIF(v.descripcion, ''),
    costo_mensual        = NULLIF(v.costo, '')::numeric,
    gabinete             = v.gabinete,
    extras               = NULLIF(v.observacion, ''),
    cluster              = NULLIF(v.cluster, ''),
    supervisor_nombre    = NULLIF(v.supervisor, ''),
    vigencia_contrato    = NULLIF(v.vigencia, '')
  FROM (VALUES
    ('ENLACE DE CAMARAS','SEDE VULCANO','Puerta Calle','Calle Vulcano 176','Ate Vitarte','Lima','FIBRA OPTICA',false,'5419','Enlace internet con Fibra optica 100 Mb - CID: 5419','120',true,'','','',''),
    ('ENLACE PRINCIPAL','SEDE VULCANO','Puerta Calle','Calle Vulcano 176','Ate Vitarte','Lima','FIBRA OPTICA',false,'5417','Enlace internet con Fibra optica 250 Mb - CID: 5417','240',true,'','','',''),
    ('ENLACE SECUNDARIO','SEDE VULCANO','Puerta Calle','Calle Vulcano 176','Ate Vitarte','Lima','FIBRA OPTICA',false,'5418','Enlace internet con Fibra optica 250 Mb - CID: 5418','120',true,'','','',''),
    ('RESTAURANTE R18','RESTAURANTE','Puerta Calle','Jiron Ica 143','Cercado de Lima','Lima','FIBRA OPTICA',false,'5714','Enlace internet con Fibra optica 12 Mb - CID: 5714','480',true,'','','',''),
    ('T02','FOOTLOOSE','Puerta Calle','Jr. De la Union 553','Cercado de Lima','Lima','FIBRA OPTICA',true,'5469','Enlace internet con Fibra optica 12 Mb - CID: 5469','480',false,'GABINETE EN TIENDA PERO NO INSTALADO','A','YESSENIA CHORRES',''),
    ('T04','FOOTLOOSE','Puerta Calle','Av. Horacio Urteaga 1337','Jesus Maria','Lima','FIBRA OPTICA',false,'26054975','Internet Corporativo 15mb + Seguridad Administrada Fisica','480',false,'Enlace internet con Fibra optica 12 Mb - CID: 5437','D','JORGE VASQUEZ',''),
    ('T08','FOOTLOOSE','Puerta Calle','Av. Arnaldo Marquez 1354','Jesus Maria','Lima','FIBRA OPTICA',false,'5438','Enlace internet con Fibra optica 12 Mb - CID: 5438','480',false,'','D','JORGE VASQUEZ',''),
    ('T10','FOOTLOOSE','CC Mega Plaza','Av. Alfredo Mendiola 3698 Int 26 1er piso','Independencia','Lima','FIBRA OPTICA',false,'24952116','Internet Corporativo 10mb + Seguridad Administrada Fisica','779.5',true,'','B','VERONICA PACCO',''),
    ('T12','FOOTLOOSE','CC Cerro Colorado Arequipa','Av. Aviacion N° 602 Int L145','Arequipa','Arequipa','HFC',false,'54700429','CLARO HFC INTERNET 80 MB - 54700429','159.32',false,'','D','CARLOS OPORTO',''),
    ('T14','FOOTLOOSE','Puerta Calle','Av. Gamarra 727','La Victoria','Lima','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','409',true,'Enlace internet con Fibra optica 12 Mb - CID: 5420','A','ALEX POVES',''),
    ('T16','FOOTLOOSE','Puerta Calle','Jr. De la Union 716-718','Cercado de Lima','Lima','LTE',false,'201141529','Emprende ilimitado 105.90 (160 GB en alta velocidad) - 201141529','89.7',false,'','D','YESSENIA CHORRES','Sin Contrato Vigente'),
    ('T18','FOOTLOOSE','Puerta Calle','Jr. Huallaga 228','Cercado de Lima','Lima','LTE',false,'972182760','Emprende Ilimitado 105.9 - 972182760','89.7',false,'','D','YESSENIA CHORRES','Sin Contrato Vigente'),
    ('T20','FOOTLOOSE','Puerta Calle','Calle Elias Aguirre 467','Chiclayo','Chiclayo','FIBRA OPTICA',true,'5439','Enlace internet con Fibra optica 12 Mb - CID: 5439','480',true,'Tienda Utiliza tambien servicio de Convergia en el almacen W4','B','MILISSA HURTADO',''),
    ('T25','FOOTLOOSE','CC Plaza Lima Sur','Av. Paseo de la Republica S/N Tda 242-244-246 2do Nivel','Chorrillos','Lima','FIBRA OPTICA',false,'5458','Enlace internet con Fibra optica 12 Mb - CID: 5458','480',true,'','C','JOHANNA ESCALANTE',''),
    ('T28','FOOTLOOSE','Puerta Calle','Jr Ayacucho 450','Cercado de Lima','Lima','FIBRA OPTICA',false,'25571481','CLARO INTERNET CORPORATIVO 10 MB','380',true,'SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','D','YESSENIA CHORRES',''),
    ('T29','FOOTLOOSE','Puerta Calle','Calle Tacna 346','Piura','Piura','FIBRA OPTICA',true,'26054474','Enlace corporativo 15mb + Seguridad administrada Virtual','480',false,'Enlace internet con Fibra optica 12 Mb - CID: 5421','D','MILISSA HURTADO',''),
    ('T31','FOOTLOOSE','Puerta Calle','Calle Elias Aguirre 466','Chiclayo','Chiclayo','FIBRA OPTICA',false,'5440','Enlace internet con Fibra optica 12 Mb - CID: 5440','480',false,'','C','MILISSA HURTADO',''),
    ('T32','FOOTLOOSE','CC Real Plaza','Av. Alfredo Mendiola 7042 Int LC 110-111','San Martin de Porres','Lima','LTE',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','380',false,'','C','VERONICA PACCO',''),
    ('T39','FOOTLOOSE','C.C.Open Plaza Atocongo','Av. Circunvalacion 1803 Int 13','San Juan de Miraflores','Lima','FIBRA OPTICA',false,'5422','Enlace internet con Fibra optica 12 Mb - CID: 5422','480',false,'','D','JOHANNA ESCALANTE',''),
    ('T40','FOOTLOOSE','C.C.Open Plaza Atocongo','Av. Circunvalacion 1803 Int 02','San Juan de Miraflores','Lima','FIBRA OPTICA',false,'5423','Enlace internet con Fibra optica 12 Mb - CID: 5423','480',false,'','C','JOHANNA ESCALANTE',''),
    ('T41','FOOTLOOSE','CC Plaza del Sol','Av. San Martin - Ayabaca S/N Int 216','Ica','Ica','LTE',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','380',true,'','B','JORGE VASQUEZ',''),
    ('T42','FOOTLOOSE','CC Real Plaza','Av. Ferrocarril 1035 Int 222','Huancayo','Huancayo','HFC',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','380',true,'','B','JESLIA AVILA',''),
    ('T43','FOOTLOOSE','CC Plaza Norte','Av. Tomas Valle con Panamericana Norte S/N Int 110B','Independencia','Lima','FIBRA OPTICA',true,'24952205','Internet Corporativo 10mb + Seguridad Administrada Fisica','779.5',true,'Enlace internet con Fibra optica 12 Mb - CID: 5459','A','VERONICA PACCO',''),
    ('T46','FOOTLOOSE','CC Real Plaza','Av. Inca Garcilazo de la Vega 1337 Int 1070','Cercado','Lima','HFC',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','380',false,'','C','YESSENIA CHORRES',''),
    ('T53','COCHERA','Puerta Calle','Jr Chota 778','Cercado de Lima','Lima','LTE',false,'923848762','Emprende Ilimitado 105.9 - 160 Gb - 923848762','89.7',false,'','','','Sin Contrato Vigente'),
    ('T57','FOOTLOOSE','CC Plaza del Sol','Calle Colon 601 Int 238','Huacho','Huacho','LTE',false,'913037871','INTERNET OLO NEGOCIOS + 180 GB a 129.90 - 913037871','110.08',true,'','C','VANESSA ALVARADO','Sin Contrato Vigente'),
    ('T59','FOOTLOOSE','Puerta Calle','Av La Molina 864','La Molina','Lima','FIBRA OPTICA',false,'5442','Enlace internet con Fibra optica 12 Mb - CID: 5442','480',false,'','C','ERNESTO PAREDES',''),
    ('T66','FOOTLOOSE','Puerta Calle','Av. Gran Chimu 772','San Juan de Lurigancho','Lima','FIBRA OPTICA',false,'26054351','Enlace corporativo 15mb + Seguridad administrada Virtual','480',false,'Enlace internet con Fibra optica 12 Mb - CID: 5444','C','ALEX POVES',''),
    ('T70','FOOTLOOSE','Puerta Calle','Jr. De la Union 400','Cercado de Lima','Lima','ANTENA',false,'714-9442','ENTEL INTERNET EMPRESA 15 MB (S404552) - 714-9442','228.73',false,'GABINETE EN TIENDA PERO NO INSTALADO','A','YESSENIA CHORRES',''),
    ('T71','FOOTLOOSE','CC Open Plaza','Urb. Miraflores Av. Andres Avelino Caceres 147 Int LC 89','Piura','Piura','LTE',false,'977806622','Emprende Ilimitado 155.9 - 977806622','132',false,'','C','MILISSA HURTADO','Sin Contrato Vigente'),
    ('T72','FOOTLOOSE','CC Mega Plaza','Lotizacion Parque Gran Chavin Mz B Lote 1-A Int L90','Chimbote','Chimbote','HFC',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','380',true,'','B','VANESSA ALVARADO',''),
    ('T74','FOOTLOOSE','CC Mega Plaza','Lotizacion Parque Gran Chavin Mz B Lote 1-A Int L73','Chimbote','Chimbote','HFC',true,'43609168','CLARO HFC INTERNET 80 MB - 43609168','159.32',false,'GABINETE EN TIENDA PERO NO INSTALADO','B','VANESSA ALVARADO',''),
    ('T78','FOOTLOOSE','Puerta Calle','Jr. Ayacucho 615','Trujillo','Trujillo','FTTH',false,'44305517','MOVISTAR FTTH 200 MBPS - 44305517','106',true,'','B','VANESSA ALVARADO',''),
    ('T79','FOOTLOOSE','Puerta Calle','Av. Proceres de la Independencia 1711','San Juan de Lurigancho','Lima','FIBRA OPTICA',true,'5445','Enlace internet con Fibra optica 12 Mb - CID: 5445','480',false,'GABINETE EN TIENDA PERO NO INSTALADO','A','ALEX POVES',''),
    ('T81','FOOTLOOSE','Mall Aventura Sta Anita','Av. Carretera Central 111 Tda b1045-1047','Santa Anita','Lima','HFC',false,'16769830','CLARO HFC INTERNET 60 MB - 16769830','87.29',true,'','C','JORGE VASQUEZ',''),
    ('T83','FOOTLOOSE','CC Real Plaza','Jr. Tumbes S/N Int LC 151-153-155','Juliaca','San Roman','LTE',false,'923857535','Internet Emprende 39 - 923857535','33.82',false,'','C','CARLOS OPORTO','Sin Contrato Vigente'),
    ('T84','FOOTLOOSE','CC Real Plaza','Jr. Independencia S/N Int. LC-120/122','Huanuco','Huanuco','HFC',true,'62636165','CLARO HFC INTERNET 80 MB - 62636165','159.32',false,'GABINETE EN TIENDA PERO NO INSTALADO','B','JESLIA AVILA',''),
    ('T85','FOOTLOOSE','CC Real Plaza','Av. Sanchez Cerro 234 LC 139','Piura','Piura','LTE',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','380',false,'','A','MILISSA HURTADO',''),
    ('T87','FOOTLOOSE','CC Real Plaza','Av. Nicolas Ayllon 8694 Int 103B','Ate Vitarte','Lima','HFC',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','380',true,'','B','JORGE VASQUEZ',''),
    ('T89','FOOTLOOSE','CC Mega Plaza','Av. Mariscal Oscar Benavides S/N Int L-15 Lote 01','Canete','Canete','FIBRA OPTICA',false,'26052695','Enlace corporativo 15mb + Seguridad administrada Virtual','89.7',false,'Emprende Ilimitado 105.9 - 923832533','C','JORGE VASQUEZ','Sin Contrato Vigente'),
    ('T90','FOOTLOOSE','Mall Aventura Sta Anita','Av. Carretera Central 111 Tda B3009-B3011-B3005','Santa Anita','Lima','HFC',false,'16337561','CLARO HFC INTERNET 40 MB - 16337561','163.56',true,'','C','JORGE VASQUEZ',''),
    ('T91','FOOTLOOSE','CC Real Plaza','Av. Collasuyo 2964, Cusco','Cusco','Cusco','LTE',false,'941461859','INTERNET OLO NEGOCIOS + 60 GB - 941461859','42',false,'','C','CARLOS OPORTO','Sin Contrato Vigente'),
    ('T92','FOOTLOOSE','CC Real Plaza','Calle Mariscal Andres Avelino Caceres N°222 LC 164-165','Chiclayo','Chiclayo','FIBRA OPTICA',true,'5426','Enlace internet con Fibra optica 12 Mb - CID: 5426','480',false,'GABINETE EN TIENDA PERO NO INSTALADO','A','MILISSA HURTADO',''),
    ('T93','FOOTLOOSE','CC Open Plaza','Av. Centenario Km 4.7 LC 11','Pucallpa','Pucallpa','FIBRA OPTICA',false,'5460','Enlace internet con Fibra optica 12 Mb - CID: 5460','480',false,'','C','JESLIA AVILA',''),
    ('T95','FOOTLOOSE','CC Real Plaza','Av. Via de Evitamiento Norte S/N Barrio San Antonio LC 222-224-226','Cajamarca','Cajamarca','FIBRA OPTICA',true,'5474','Enlace internet con Fibra optica 12 Mb - CID: 5474','480',true,'','B','VANESSA ALVARADO',''),
    ('T98','FOOTLOOSE','CC Real Plaza','Av. Centenario N° 365 LC 102/104/106','Pucallpa','Pucallpa','HFC',false,'61634722','CLARO HFC INTERNET 12 MB - 61634722','114.4',false,'','C','JESLIA AVILA',''),
    ('TA2','FOOTLOOSE','CC Open Plaza','Lote 02,03 Y 04 Jr. Dos de mayo S/N - LC 10','Huanuco','Huanuco','HFC',false,'62636159','CLARO HFC INTERNET 80 MB - 62636159','159.32',false,'','C','JESLIA AVILA',''),
    ('TA7','FOOTLOOSE','Puerta Calle','Calle Vulcano 176A','Ate Vitarte','Lima','FIBRA OPTICA',false,'','Internet proporcionado por Sede Principal','0',true,'','C','ERNESTO PAREDES',''),
    ('TA9','FOOTLOOSE','CC Mega Plaza','Av. Alameda Sur esq. Con Av. San Marcos, mz II LC 108','Chorrillos','Lima','LTE',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','380',false,'','C','JOHANNA ESCALANTE',''),
    ('TC1','FOOTLOOSE','Mall del Sur','Av. Los Lirios 301 Int 2170-2174','San Juan de Miraflores','Lima','FIBRA OPTICA',true,'5461','Enlace internet con Fibra optica 12 Mb - CID: 5461','480',false,'','A','JOHANNA ESCALANTE',''),
    ('TC2','FOOTLOOSE','Mall del Sur','Av. Los Lirios 301 Int 1142','San Juan de Miraflores','Lima','FIBRA OPTICA',false,'','Enlace internet con Fibra optica 12 Mb - CID: 5462','480',false,'GABINETE EN TIENDA PERO NO INSTALADO','B','JOHANNA ESCALANTE',''),
    ('TC4','FOOTLOOSE','CC Real Plaza','Av. Cesar Vallejo Oeste N°1345 esquina con Av. Fatima, Urb. Real Plaza Trujillo','Trujillo','Trujillo','LTE',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','380',false,'','','',''),
    ('TC5','FOOTLOOSE','CC Mega Plaza','Av. Mezones Muro S/N Int. 07-08-09','Jaen','Cajamarca','LTE',true,'960212980','Emprende Ilimitado 155.9 - 220 Gb -960212980','132',false,'GABINETE EN TIENDA PERO NO INSTALADO','B','VANESSA ALVARADO','Sin Contrato Vigente'),
    ('TC6','FOOTLOOSE','CC Plaza Norte','Av. Tomas Valle c/ Panamericana Norte S/N. Int. LI 110 A','Independencia','Lima','FIBRA OPTICA',true,'24950170','Internet Corporativo 10mb + Seguridad Administrada Fisica','779.5',true,'Enlace internet con Fibra optica 12 Mb - CID: 5436','A','VERONICA PACCO',''),
    ('TC7','FOOTLOOSE','CC Mega Plaza','Av. Alfredo Mendiola N° 3698 LC 309','Independencia','Lima','FIBRA OPTICA',false,'24952204','Internet Corporativo 10mb + Seguridad Administrada Fisica','779.5',true,'','A','VERONICA PACCO',''),
    ('TC8','FOOTLOOSE','CC Mega Plaza','Av. Las Americas Esq Av. Fermin Tanguis L14-L15','Pisco','Ica','LTE',true,'923223342','Emprende Ilimitado 155.9 - 220 Gb - 923223342','132',false,'MOVISTAR ADSL 15 MB - 056385087 GABINETE EN TIENDA PERO NO INSTALADO','A','JORGE VASQUEZ','Sin Contrato Vigente'),
    ('TC9','FOOTLOOSE','CC Open Plaza','Av. Ferrocarril N° 146-150, esq. con Prolongacion San Carlos N° 136 LC-29','Huancayo','Huancayo','ADSL',false,'64413301','MOVISTAR ADSL 15 MB - 064413301','91.53',false,'','C','JESLIA AVILA',''),
    ('TD1','FOOTLOOSE','Puerta Calle','Av. Proceres de la Independencia N1720','San Juan de Lurigancho','Lima','FIBRA OPTICA',true,'26054323','Enlace corporativo 15mb + Seguridad administrada Virtual','480',false,'Enlace internet con Fibra optica 12 Mb - CID: 5446','D','ALEX POVES',''),
    ('TD2','FOOTLOOSE','CC El Quinde','Av. Los Maestros N° 206 del Fundo San Jose Local 130,132,134','Ica','Ica','LTE',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','380',true,'','B','JORGE VASQUEZ',''),
    ('TD3','FOOTLOOSE','Centro Tematico','Jiron Abtao No 623 -LC 11','Ilo','Moquegua','FIBRA OPTICA',true,'26054124','Internet Coporativo 15mb + Seguridad Gestionada Virtual','480',false,'Enlace internet con Fibra optica 12 Mb - CID: 5428','C','CARLOS OPORTO',''),
    ('TD4','FOOTLOOSE','CC Real Plaza','Lote DEP del Pueblo Joven Cesar Vallejo - LC 215','Villa Maria del Triunfo','Lima','HFC',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','380',true,'CLARO HFC INTERNET 80 MB - 12330820','A','JOHANNA ESCALANTE',''),
    ('TD7','FOOTLOOSE','Outlet','Nro- s/n int.131 Otr.Predio las salinas (parcela c-41 y area remamente 1-B)','Lurin','Lima','FTTH',false,'12332257','INTERNET CLARO EMPRESA DIGITAL 200 MBPS - 12332257','79',false,'','C','JOHANNA ESCALANTE',''),
    ('TD8','FOOTLOOSE','Puerta Calle','Calle Elias Aguirre 420','Chiclayo','Chiclayo','FIBRA OPTICA',false,'26073166','Internet Coporativo 15mb + Seguridad Gestionada Virtual','480',false,'Enlace internet con Fibra optica 12 Mb - CID: 5447','C','MILISSA HURTADO',''),
    ('TD9','FOOTLOOSE','C.C. Costa Mar Plaza','Calle San Martin N° 275 LC 104/105','Tumbes','Tumbes','FIBRA OPTICA',true,'5435','Enlace internet con Fibra optica 12 Mb - CID: 5435','480',false,'GABINETE EN TIENDA PERO NO INSTALADO','A','MILISSA HURTADO',''),
    ('TE3','FOOTLOOSE','Plaza Center Placita','Urb. Parque Industrial del Cono Sur Mz. K3 Lote 1','Villa El Salvador','Lima','ANTENA',false,'717-9073','ENTEL INTERNET (S354008) - 717-9073','381.27',true,'','B','JOHANNA ESCALANTE',''),
    ('TE6','FOOTLOOSE','CC El Quinde','Av. Rafael Hoyos Rubio c/ Jr. Sor Manuela Gil 151 - LE 101','Cajamarca','Cajamarca','FIBRA OPTICA',true,'5429','Enlace internet con Fibra optica 12 Mb - CID: 5429','480',true,'','B','VANESSA ALVARADO',''),
    ('TE7','FOOTLOOSE','CC Plaza San Miguel','Av. La Marina N° 2000-2100 C-125-126 - CC Plaza San Miguel','San Miguel','Lima','LTE',true,'','Internet Corporativo 10mb + Seguridad Administrada Fisica','',true,'SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER | CONVERGIA','B','MITCHELL RAMIREZ',''),
    ('TE8','FOOTLOOSE','Minka','AVENIDA ARGENTINA 3093 - LOCAL: P03-G02-L590','Callao','Callao','FIBRA OPTICA',false,'5464','Enlace internet con Fibra optica 12 Mb - CID: 5464','480',true,'','B','MITCHELL RAMIREZ',''),
    ('TEC01','FOOTLOOSE','CC RIO CENTRO','Av. Fco de Orellana Riocentro Norte local 117 planta alta.','Guayaquil','Ecuador','FIBRA OPTICA',false,'','INTERNET SDWAN CORPORATIVO & SECURITY SECURE SDWAN ADVANCED FORTIGATE 40F','125',true,'','','',''),
    ('TEC02','FOOTLOOSE','Puerta Calle','Zona bancaria en la Mz. K20 calle Rocafuerte, Machala 070201, Ecuador','Guayaquil','Ecuador','FTTH',false,'','GOPYMES 200 MBPS + WIFI TOTAL','77.63',true,'','','',''),
    ('TEC03','FOOTLOOSE','CC Gran Piazza','Centro comercial Gran Piazza','Machala','Ecuador','FIBRA OPTICA',false,'','INTERNET SDWAN CORPORATIVO & SECURITY SECURE SDWAN ADVANCED FORTIGATE 40F','125',true,'','','',''),
    ('TEC04','R18','CC Gran Piazza','Centro comercial Gran Piazza','Machala','Ecuador','FIBRA OPTICA',false,'','INTERNET SDWAN CORPORATIVO & SECURITY SECURE SDWAN ADVANCED FORTIGATE 40F','125',true,'','','',''),
    ('TF2','FOOTLOOSE','Puerta Calle','Av. Canto Grande Mz H lote 19','San Juan de Lurigancho','Lima','FIBRA OPTICA',false,'26054070','CLARO INTERNET CORPORATIVO i15MB + SEGURIDAD GESTIONADA VIRTUAL','480',true,'Bitel 10MB CID: 5448 - PENDIENTE DE BAJA','D','ALEX POVES',''),
    ('TF5','FOOTLOOSE','C.C. Real Plaza Puruchuco','Av. Nicolas Ayllon N° 4770, LC-248- EX FUNDO VISTA ALEGRE, 2do PISO','Ate Vitarte','Lima','FIBRA OPTICA',false,'11085657','CLARO INTERNET CORPORATIVO 10 MB (11085657) - 11085657','270',true,'','B','JORGE VASQUEZ',''),
    ('TF6','FOOTLOOSE','C.C. Real Plaza Puruchuco','Av. Nicolas Ayllon N° 4770, LC-157, LC-158 - EX FUNDO VISTA ALEGRE, 1ER PISO','Ate Vitarte','Lima','FIBRA OPTICA',true,'11085660','CLARO INTERNET CORPORATIVO 10 MB (11085660) - 11085660','270',true,'','B','JORGE VASQUEZ',''),
    ('TF7','FOOTLOOSE','Mall Plaza Comas','Av Los Angeles, Comas 15314 int. b2008-2010','Comas','Lima','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','380',true,'','B','VERONICA PACCO',''),
    ('TF8','FOOTLOOSE','Mall Plaza Comas','Av Los Angeles, Comas 15315 int. B1009','Comas','Lima','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','380',true,'','B','VERONICA PACCO',''),
    ('TF9','FOOTLOOSE','Plaza Vea Tumbes','AV.Teniente Vasquez (Panamericana Norte) con Calle La Marina s/n','Tumbes','Tumbes','LTE',false,'913037873','INTERNET OLO NEGOCIOS +180GBS- 913037873 S/129.90','110.08',true,'','C','MILISSA HURTADO','Sin Contrato Vigente'),
    ('TG2','FOOTLOOSE','Mall Aventura Chiclayo','Mall Aventura Int. 1029-1031-1033 /cruce de la Panamericana Norte y Circunvalacion','Chiclayo','Chiclayo','FIBRA OPTICA',true,'NC21138','GTD PERU FIBRA 10 MB','420',true,'','B','MILISSA HURTADO',''),
    ('TG3','FOOTLOOSE','Puerta Calle','Av. San Lorenzo Mz. A, Lt 01 Urb. Las Vegas (Alt. del Ovalo Puente Piedra) int. LC 105','Puente Piedra','Lima','FIBRA OPTICA',true,'5430','Enlace internet con Fibra optica 12 Mb - CID: 5430','480',true,'','A','MITCHELL RAMIREZ',''),
    ('TG4','FOOTLOOSE','CC Plaza Vea Puente Piedra','Av. San Lorenzo Mz. A, Lt 01 Urb. Las Vegas (Alt. del Ovalo Puente Piedra) int. LC 104','Puente Piedra','Lima','FIBRA OPTICA',true,'5431','Enlace internet con Fibra optica 12 Mb - CID: 5431','480',true,'','A','MITCHELL RAMIREZ',''),
    ('TG5','FOOTLOOSE','CC Plaza Vea CenterLurin','Urb. San Vicente S/N. Calle Antigua Panamericana Sur Parcela B-43 int. LC-110','Lurin','Lima','FIBRA OPTICA',false,'5432','Enlace internet con Fibra optica 12 Mb - CID: 5432','480',true,'','B','JOHANNA ESCALANTE',''),
    ('TG6','FOOTLOOSE','C. C. In Oulet Premium Faucett','Av. Elmer Faucett Nro. 3443 Int 134','Callao','Callao','LTE',false,'923217912','Emprende ilimitado 155.90 (220 GB en alta velocidad) - 923217912','132',false,'','B','MITCHELL RAMIREZ','Sin Contrato Vigente'),
    ('TG8','FOOTLOOSE','C. C. Plaza Center Ventanilla','Av. Nestor Gambeta S/N Int 203','Ventanilla','Callao','FIBRA OPTICA',false,'5467','Enlace internet con Fibra optica 12 Mb - CID: 5467','480',true,'','C','MITCHELL RAMIREZ',''),
    ('TH1','FOOTLOOSE','Puerta Calle','Av. Proceres De La Independencia N 1637-1639 Urb Las Flores','San Juan de Lurigancho','Lima','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','409',true,'Enlace internet con Fibra optica 12 Mb - CID: 5450','B','ALEX POVES',''),
    ('TH2','FOOTLOOSE','CC Real Plaza Cusco','Av. Collasuyo No 2964 tda LC-181','Cusco','Cusco','LTE',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','380',true,'','B','CARLOS OPORTO',''),
    ('TH3','FOOTLOOSE','C.C. MEGA PLAZA CHINCHA','PRO.MARISCAL BENAVIDES NRO. 1224 (TDA. L31)','Chincha','Ica','LTE',false,'977661960','Emprende ilimitado 105.90 (160 GB en alta velocidad) - 977661960','89.7',true,'','C','JORGE VASQUEZ','Sin Contrato Vigente'),
    ('TH4','FOOTLOOSE','CC Mega Plaza Huaral','CAR.CARRETERA HUARAL KM. 8 OTR. TERRENO SN ASIGNADO LETRA B (L001)','Huaral','Huaral','LTE',false,'','INTERNET OLO NEGOCIOS +180GBS S/129.90','110.08',true,'','C','VANESSA ALVARADO','Sin Contrato Vigente'),
    ('TH5','FOOTLOOSE','CC Mega Plaza','LOTE. B-C OTR. SUB LOTE B-C UBICADO EN SECTOR ZANJA HONDA (L18)','Jaen','Cajamarca','LTE',false,'955439099','Emprende ilimitado 155.90 (220 GB en alta velocidad) - 955439099','132',true,'','C','VANESSA ALVARADO','Sin Contrato Vigente'),
    ('TH6','FOOTLOOSE','CC PLAZA CENTER TARAPOTO','AV. SALAVERRY NRO. 888 LCI 104','Tarapoto','San Martin','LTE',false,'960308321','Emprende ilimitado 155.90 (220 GB en alta velocidad) - 960308321','132',true,'','C','DIEGO SILVA','Sin Contrato Vigente'),
    ('TH7','FOOTLOOSE','Puerta Calle','JR. GREGORIO DELGADO NRO. 158 SAN MARTIN','Tarapoto','San Martin','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','409',true,'Enlace internet con Fibra optica 12 Mb - CID: 5451','B','DIEGO SILVA',''),
    ('TH8','FOOTLOOSE','Puerta Calle','AV. ENRIQUE PALACIO NRO. 112 PIURA','Sullana','Piura','FIBRA OPTICA',false,'5452','Enlace internet con Fibra optica 12 Mb - CID: 5452','480',true,'','C','MILISSA HURTADO',''),
    ('TH9','FOOTLOOSE','CC TOTTUS JOCKEY PLAZA','AV. JAVIER PRADO ESTE NRO. 4010 URB. FUNDO MONTERRICO CHICO MZ A PARC. B','Surco','Lima','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','380',true,'','D','ERNESTO PAREDES',''),
    ('TI1','FOOTLOOSE','CC TOTTUS SULLANA','AV. PANAMERICANA NRO. 461 URB. SANTA ROSA (L04)','Sullana','Piura','LTE',false,'977769681','Emprende ilimitado 105.90 (160 GB en alta velocidad) - 977769681','89.7',true,'','B','MILISSA HURTADO','Sin Contrato Vigente'),
    ('TI2','FOOTLOOSE','Puerta Calle','JR. PROSPERO NRO. 374 (JR. PROSPERO NRO. 374 Y 376) IQUITOS','Iquitos','Maynas','FIBRA OPTICA',false,'5472','Enlace internet con Fibra optica 12 Mb - CID: 5472','480',true,'','D','DIEGO SILVA',''),
    ('TI4','FOOTLOOSE','Puerta Calle','AV. PROCERES DE LA INDEPENDEN NRO. 3358 (MZ. H LT. 05 ASOCIACION PRO VIV. GARAGAY)','San Juan de Lurigancho','Lima','FIBRA OPTICA',false,'','Internet Coporativo 15mb + Seguridad Gestionada Virtual','480',true,'Enlace internet con Fibra optica 12 Mb - CID: 5453','C','ALEX POVES',''),
    ('TI5','FOOTLOOSE','CC. TOTTUS CUSCO','PRO.AV. DE LA CULTURA NRO. 2219 INT. LC04','Cusco','Cusco','LTE',false,'970721169','Emprende ilimitado 155.90 (220 GB en alta velocidad) - 970721169','132',true,'','D','CARLOS OPORTO','Sin Contrato Vigente'),
    ('TI6','FOOTLOOSE','CC PLAZA VEA MOQUEGUA','AV. CIRCUNVALACION LOTE. 1B INT. L102','Mariscal Nieto','Moquegua','LTE',false,'946281540','Emprende Ilimitado 105.90 - 160GB','89.7',true,'','D','CARLOS OPORTO','Sin Contrato Vigente'),
    ('TI7','FOOTLOOSE','CC PLAZA VEA CHINCHA','NRO. S/N INT. L106 OTR. OSCAR R. BENAVIDES (LCE)','Chincha','Ica','LTE',false,'970742854','Emprende ilimitado 155.90 (220 GB en alta velocidad) - 970742854','132',true,'','D','JORGE VASQUEZ','Sin Contrato Vigente'),
    ('TI8','FOOTLOOSE','CC Totus Chepen','CAR.PANAMERICANA KM. 696 (LC-03 Y 04 CC TOTTUS CHEPEN) LA LIBERTAD - CHEPEN - CHEPEN','Chepen','Chepen','LTE',false,'960201920','Emprende ilimitado 155.90 (220 GB en alta velocidad) - 960201920','132',true,'','C','VANESSA ALVARADO','Sin Contrato Vigente'),
    ('TI9','FOOTLOOSE','Puerta Calle','AV. MURO NRO. 104B (MZ.J1 LT.1 F MCAL.CACERES SECTOR II)','San Juan de Lurigancho','Lima','FIBRA OPTICA',true,'','Internet Coporativo 15mb + Seguridad Gestionada Virtual','480',true,'Enlace internet con Fibra optica 12 Mb - CID: 5454','B','ALEX POVES',''),
    ('TJ1','FOOTLOOSE','Puerta Calle','AV. LEON VELARDE NRO. 437 MADRE DE DIOS','Puerto Maldonado','Tambopata','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','409',true,'Enlace internet con Fibra optica 12 Mb - CID: 5455','C','CARLOS OPORTO',''),
    ('TJ3','FOOTLOOSE','CC. Mall Aventura','AV. PORONGOCHE NRO. 500 (A-2051)','Paucarpata','Arequipa','LTE',false,'970991254','Emprende Ilimitado 155.9 - 220 Gb - 970991254','132',true,'','C','CARLOS OPORTO','Sin Contrato Vigente'),
    ('TJ4','FOOTLOOSE','CC. PLAZA VEA PAITA','AV. ALMIRANTE MIGUEL GRAU 514 (LCE-102 Y 103)','Paita','Paita','LTE',false,'949731850','INTERNET OLO NEGOCIOS + 180 GB - 949731850','110.08',true,'','C','MILISSA HURTADO','Sin Contrato Vigente'),
    ('TJ5','FOOTLOOSE','Puerta Calle','JR. SAN MARTIN NRO. 478 (BARRIO DE BELEN)','Moyobamba','Moyobamba','FIBRA OPTICA',false,'5456','Enlace internet con Fibra optica 12 Mb - CID: 5456','480',true,'','D','DIEGO SILVA',''),
    ('TJ6','FOOTLOOSE','CC Mega Plaza Barranca','CALLE CASTILLA NO. 370','Barranca','Barranca','LTE',false,'871207794','INTERNET IFI EMPRESA 20Mbps UP - 871207794','83.81',true,'','B','VANESSA ALVARADO','Sin Contrato Vigente'),
    ('TJ8','FOOTLOOSE','Puerta Calle','JR. JOSE PRATO N° 366 - 370','Rupa Rupa','Huanuco','FIBRA OPTICA',false,'26055017','Internet Coporativo 15mb + Seguridad Gestionada Virtual','480',true,'Enlace internet con Fibra optica 12 Mb - CID: 5434','C','JESLIA AVILA',''),
    ('TK1','FOOTLOOSE','Puerta Calle','JR. 2 DE MAYO N°991','Huanuco','Huanuco','FTTH',false,'62289662','MOVISTAR FTTH 200 MBPS - 062289662','110.08',true,'','D','JESLIA AVILA',''),
    ('TK2','FOOTLOOSE','CC. PLAZA CENTER REX','CAL.ALFREDO MENDIOLA ESQ. TOM NRO. S/N (LCE-202)','San Martin De Porres','Lima','LTE',false,'923875012','Emprende ilimitado 155.90 (220 GB en alta velocidad) - 923875012','132',true,'','D','VERONICA PACCO','Sin Contrato Vigente'),
    ('TK5','FOOTLOOSE','CC Plaza San Miguel','Av.La Marina 2000 - San Miguel / 2do Nivel/ Local 248-249','San Miguel','Lima','FIBRA OPTICA',false,'','Internet Corporativo 10mb + Seguridad Administrada Fisica','',true,'Internet OLO Negocios 169.90 + 240 Gb (941653684)','C','MITCHELL RAMIREZ','Sin Contrato Vigente'),
    ('TK6','FOOTLOOSE','Puerta Calle','JR. DE LA UNION NRO. 431','Cercado de Lima','Lima','HFC',false,'13128699','MOVISTAR HFC 150 MBPS - 013128699','104.9',true,'','D','YESSENIA CHORRES',''),
    ('TK7','R18','Puerta Calle','AV. GRAN CHIMU NRO. 851','San Juan de Lurigancho','Lima','FIBRA OPTICA',false,'5441','Enlace internet con Fibra optica 12 Mb - CID: 5441','480',true,'','D','ALEX POVES',''),
    ('TK8','FOOTLOOSE','Puerta Calle','AV. SANTIAGO ANTUNEZ DE MAYOLO NRO. 1163','Los Olivos','Lima','FIBRA OPTICA',false,'','Internet dedicado Fibra optica 10 Mb','380',true,'','D','VERONICA PACCO',''),
    ('TL1','FOOTLOOSE','Puerta Calle','MZA. C5 LOTE. 13 URB. EX ZONA COMERCIAL E INDUSTRIAL DE VENTANILLA','Ventanilla','Callao','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','380',true,'','C','MITCHELL RAMIREZ',''),
    ('TL2','FOOTLOOSE','Puerta Calle','JR. TACNA NRO. 663','Pucallpa','Ucayali','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','409',true,'HFC Internet Claro Empresas Digital 300Mbps - 61634203','D','JESLIA AVILA',''),
    ('TL3','FOOTLOOSE','Mall Aventura Iquitos','AV.JOSE ABELARDO QUIÑONEZ, LOTE LAS NINFAS-2, ZONA URABA SAN JUAN BAUTISTA LOCAL N° B-1022','Iquitos','Maynas','FIBRA OPTICA',false,'','FIBRA OPTICA AMAZONICA 10 MB (1:1) - S/N','634.6',true,'','C','DIEGO SILVA',''),
    ('TL4','FOOTLOOSE','Puerta Calle','MANZANA C1 LOTE 25, URBANIZACION LOS PINOS','San Juan de Lurigancho','Lima','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','380',true,'','C','ALEX POVES',''),
    ('TL5','R18','Minka','AVENIDA ARGENTINA 3093 - LOCAL: P09-C03-L109-L110','Callao','Callao','LTE',false,'969723731','Internet OLO Negocios + 120 GB (969723731)','76',true,'','C','MITCHELL RAMIREZ','Sin Contrato Vigente'),
    ('TL6','R18','Mall Aventura Iquitos','Av. Jose Abelardo Quiñonez, Lote Las Ninfas -2, Zona Urbana San Juan Bautista Local N° B-2014,B-2016','Iquitos','Maynas','FIBRA OPTICA',false,'','FIBRA OPTICA AMAZONICA 10 MB (1:1) - S/N','634.6',true,'','D','DIEGO SILVA',''),
    ('TL8','FOOTLOOSE','Mall Aventura SJL','Av.Lurigancho N°997-999, Urb.Zarate Industrial interior B-1020 B-1022 B-1024','San Juan de Lurigancho','Lima','FIBRA OPTICA',true,'','DITSAC FIBRA 25 MB - S/N','84.75',true,'Tienen contingencia Tplink ER706W','A','ALEX POVES',''),
    ('TL9','FOOTLOOSE SPORT','Mall Aventura SJL','Av.Lurigancho N°997-999, Urb.Zarate Industrial interior B-2022 B-2024 B-2026','San Juan de Lurigancho','Lima','FIBRA OPTICA',true,'','DITSAC FIBRA 25 MB - S/N','84.75',true,'Tienen contingencia Tplink ER706W','B','ALEX POVES',''),
    ('TM1','FOOTLOOSE','Minka','Avenida Argentina 3093, Local P07 - C03 - L442 - CC. MINKA','Callao','Callao','FIBRA OPTICA',false,'5473','Enlace internet con Fibra optica 12 Mb - CID: 5473','480',true,'','B','MITCHELL RAMIREZ',''),
    ('TM4','R18','Puerta Calle','JIRON GREGORIO DELGADO N° 136, CIUDAD DE TARAPOTO - ZONA DE MOYOBAMBA','Tarapoto','San Martin','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','409',true,'','D','DIEGO SILVA',''),
    ('TM7','R18','C. C. In Oulet Premium Faucett','Av. Elmer Faucett N° 3443 - Calle Corparc N° 142 INT. LC L112 - Callao','Callao','Lima','LTE',false,'923799911','Emprende Ilimitado 105.9 (923799911)','89.7',true,'','D','MITCHELL RAMIREZ','Sin Contrato Vigente'),
    ('TM8','FOOTLOOSE','Puerta Calle','AV. NARANJAL 1447 - 1449 URB, PARQUE NARANJAL II ETAPA LOS OLIVOS','Los Olivos','Lima','HFC',false,'744707447','MOVISTAR HFC 200 MBPS - 744707447','99.9',true,'','C','VERONICA PACCO',''),
    ('TM9','FOOTLOOSE','Puerta Calle','Av. Andres Avelino Caceres Mz. C8 LT. 17 - Zona Urbanizacion Ex. Zona Comercial e Industrial de Ventanilla.','Ventanilla','Lima','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','409',true,'','B','MITCHELL RAMIREZ',''),
    ('TN1','FOOTLOOSE','C.C.Open Plaza Atocongo','Av. Circunvalacion N° 1801 - LC -37 - SAN JUAN DE MIRAFLORES CC- OPEN PLAZA ATOCONGO','San Juan de Miraflores','Lima','LTE',false,'941653554','INTERNET OLO NEGOCIOS + 240 GB - 941653554','143.2',true,'','C','JOHANNA ESCALANTE','Sin Contrato Vigente'),
    ('TN5','FOOTLOOSE','CC BOULEVARD PUNTA HERMOSA','Interior Parcela 2A, distrito de Punta Hermosa, LC 10 - 11','Punta Hermosa','Lima','LTE',false,'966459246','Internet OLO Negocios + 240 Gb - 966459246','143.2',true,'','D','JOHANNA ESCALANTE','Sin Contrato Vigente'),
    ('TN6','R18','Puerta Calle','Avenida Nicolas de Pierola Mz. P Lt 11, Carabayllo - Lima','Carabayllo','Lima','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','409',true,'','D','MITCHELL RAMIREZ',''),
    ('TN7','FOOTLOOSE','Puerta Calle','Avenida Tupac Amaru 3270, Carabayllo - Lima','Carabayllo','Lima','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','409',true,'','D','MITCHELL RAMIREZ',''),
    ('TN8','FOOTLOOSE SPORT','Puerta Calle','Avenida Tupac Amaru 3346, Carabayllo - Lima','Carabayllo','Lima','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','409',true,'','C','MITCHELL RAMIREZ',''),
    ('TN9','FOOTLOOSE','Puerta Calle','Avenida Victor Andres Belaunde Oeste N° 356, Mz E lote 27, Urb. Huaquillay 2da etapa - Comas','Comas','Lima','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','409',true,'INTERNET CLARO EMPRESAS DIGITAL 300 Mbps + Telefonia 100 - 16536550','C','VERONICA PACCO',''),
    ('TO1','FOOTLOOSE','CC KM 40','Agrupamiento de Familias Jahuay Sector A, Mz Y Lote N° 1-4, Distrito de Lurin, interior T13-T14','Lurin','Lima','LTE',false,'923998674','Emprende Ilimitado 105.9 (160 GB en alta velocidad) - 923998674','89.7',true,'','D','JOHANNA ESCALANTE','Sin Contrato Vigente'),
    ('TO2','FOOTLOOSE','CC Plaza del Sol','CC Plaza del Sol, Calle Colon 601 Int. Lc 288, 286 y 284, distrito de huacho','Huacho','Lima','LTE',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','409',true,'','B','VANESSA ALVARADO',''),
    ('TO3','R18','Puerta Calle','AV. NARANJAL NRO. 1485 URB. PARQUE DEL NARANJAL II ETAPA LIMA - LIMA - LOS OLIVOS','Los Olivos','Lima','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','380',true,'','B','VERONICA PACCO',''),
    ('TO4','FOOTLOOSE','Puerta Calle','Calle Lopez de Zuniga N 212, distrito de Chancay','Chancay','Lima','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','409',true,'','D','VANESSA ALVARADO',''),
    ('TO5','FOOTLOOSE SPORT','Puerta Calle','Avenida Abancay N° 1000 y Avenida Abancay N° 1004, Lima','Cercado de Lima','Lima','LTE',false,'','Internet OLO Negocios + 180 GB','110.08',true,'','D','YESSENIA CHORRES','Sin Contrato Vigente'),
    ('TO6','FOOTLOOSE SPORT','CC Real Plaza Puruchuco','Avenida nicolas ayllon 4770 - LCI-101 PURUCHUCO (Dentro de Plaza Vea)','Ate Vitarte','Lima','FIBRA OPTICA',true,'NC227200','GTD PERU FIBRA 15 MB + SEGURIDAD GESTIONADA FISICA','650',true,'INTERNET IFI EMPRESA 20Mbps UP 871208506','D','JORGE VASQUEZ',''),
    ('TO7','R18','CC Real Plaza Puruchuco','AV.NICOLAS AYLLON 4770 - LC-206 PURUCHUCO','Ate Vitarte','Lima','FIBRA OPTICA',true,'NC227157','GTD PERU FIBRA 15 MB + SEGURIDAD GESTIONADA FISICA','650',true,'Internet OLO Negocios + 240 Gb 941653554','C','JORGE VASQUEZ',''),
    ('TO8','FOOTLOOSE','Puerta Calle','Centro Civico 002209, Urb. Centro Civico, Distrito de Parinas','Parinas','Talara','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','409',true,'','C','MILISSA HURTADO',''),
    ('TO9','R18','CC Mega Plaza Chorrillos','Av. Alameda Sur esq. con Av. San Marcos, Manzana II, CC. Mega Plaza Chorrillos L206 - 207','Chorrillos','Lima','LTE',false,'986707525','INTERNET OLO NEGOCIOS +240GBS - 986707525','143.2',true,'','D','JOHANNA ESCALANTE','Sin Contrato Vigente'),
    ('TP1','FOOTLOOSE','CC Plaza Center','Av. Salaverry 888, Tarapoto 22201, LC 105-106 CC. Plaza Center','Tarapoto','San Martin','FIBRA OPTICA',true,'NC227207','GTD PERU FIBRA 15 MB + SEGURIDAD GESTIONADA FISICA','650',true,'Internet OLO Negocios + 30 GB','D','DIEGO SILVA',''),
    ('TP2','R18','Puerta Calle','Av. Muro N° 104 Mz. J-1, Lt. 1 - F programa ciudad Mariscal Caceres sector II, ref. Barrio 2, San Juan de Lurigancho','San Juan de Lurigancho','Lima','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','409',true,'','D','ALEX POVES',''),
    ('TP3','R18','CC Mega Plaza Barranca','Jr. Ramon Zavala N° 164 - 180 y Jr. Castilla N° 107, interior L-2 .','Barranca','Barranca','FIBRA OPTICA',true,'CID 25571482','CLARO FIBRA 10 MB + SEGURIDAD GESTIONADA FORTIGATE','',true,'','C','VANESSA ALVARADO','Sin Contrato Vigente'),
    ('TP4','FOOTLOOSE','CC Portal F Pizarro','Jr. Pizarro No 650-654-664-666, CC. Portal F Pizarro interior LC 203Y204','Trujillo','Trujillo','FIBRA OPTICA',false,'NC227118','GTD PERU FIBRA 15 MB + SEGURIDAD GESTIONADA FISICA','650',true,'','B','VANESSA ALVARADO',''),
    ('TP5','FOOTLOOSE','CC Mall Aventura','Av. Porongoche No. 500, Int. A-1105, Distrito de Paucarpata, Arequipa','Arequipa','Arequipa','LTE',false,'','Emprende Ilimitado 105.9 - 160 Gb','89.7',true,'','B','CARLOS OPORTO','Sin Contrato Vigente'),
    ('TP6','FOOTLOOSE','CC Real Plaza','CC. Real Plaza Arequipa, Av. Ejercito No. 1009, interior LC 133, Distrito de Cayma, Arequipa','Cayma','Arequipa','FIBRA OPTICA',false,'25571338','SERVICIO DE INTERNET DE FIBRA OPTICA CLARO 10MB','',true,'Emprende Ilimitado 155.9 - 220 Gb en alta velocidad - 955451063','D','CARLOS OPORTO',''),
    ('TP7','R18','Puerta Calle','Av. Proceres de la Independencia 1715, San Juan de Lurigancho 15431, Lima','Lima','Lima','FTTH',true,'ID-TIENDA','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','409',true,'','D','ALEX POVES',''),
    ('TP8','FOOTLOOSE','Puerta Calle','Jr. 28 de Julio Nro. 200-202 Sector Cercado Ayacucho','Ayacucho','Ayacucho','FIBRA OPTICA',true,'26052914','Enlace Corporativo 15mb + Seguridad Administrada Virtual','209.9',true,'Internet OLO Negocios + 300 GB 913037839','B','JESLIA AVILA','Sin Contrato Vigente'),
    ('TP9','FOOTLOOSE','CC Real Plaza Piura','Zona Industrial antigua Av. Sanchez Cerro Nro 234 DPTO 139 Mza 239, lote A. Local R-04-4','Piura','Piura','FIBRA OPTICA',false,'','','',true,'','','',''),
    ('TQ1','R18','Mall Plaza Comas','AV. LOS ANGELES 602','Comas','Lima','LTE',false,'940844966','INTERNET OLO NEGOCIOS +240GBS','144',true,'','','','Sin Contrato Vigente'),
    ('TQ2','R18','Real Plaza Huancayo','AV. FERROCARRIL NRO. 1035 (LC-311 REAL PLAZA HUANCAYO)','Huancayo','Huancayo','FIBRA OPTICA',false,'','','',true,'','','',''),
    ('TQ3','FOOTLOOSE','Parque Canete','Av. Mariscal Benavides s/n Mega plaza - Tiendas 08-09- San Vicente','San Vicente','Canete','FIBRA OPTICA',false,'26052807','Enlace Corporativo 15mb + Seguridad Administrada Virtual','',true,'','','',''),
    ('TQ4','R18','Mall Aventura Sta Anita','Av. Carretera Central 111, LOCAL B-2049 - B-2040','Santa Anita','Lima','FIBRA OPTICA',false,'','','',true,'','','',''),
    ('TQ5','FOOTLOOSE','Puerta Calle','Av Oscar R. Benavides 182','Chincha','Ica','FIBRA OPTICA',false,'','','',true,'','','',''),
    ('ALMACEN W4','ALMACEN','Puerta Calle','Calle Elias Aguirre 467','Chiclayo','Chiclayo','FIBRA OPTICA',true,'','SERVICIO DE INTERNET CxC SD-WAN y CxC ROUTER','409',true,'Tienda Utiliza tambien servicio de Convergia en el almacen W4','','','')
  ) AS v(codigo, formato, nombre_cc, direccion, distrito, provincia, tipo_conexion, tiene_cont, cid, descripcion, costo, gabinete, observacion, cluster, supervisor, vigencia)
  WHERE t.codigo = v.codigo
  RETURNING t.codigo
) SELECT COUNT(*) AS tiendas_actualizadas FROM upd;

-- =============================================================================
-- PASO 3: Actualizar proveedor_id por nombre de proveedor
-- =============================================================================

-- BITEL
WITH upd AS (
  UPDATE tiendas SET proveedor_id = (SELECT id FROM proveedores WHERE nombre ILIKE 'BITEL' LIMIT 1)
  WHERE codigo IN ('ENLACE DE CAMARAS','ENLACE PRINCIPAL','ENLACE SECUNDARIO','RESTAURANTE R18','T02','T08','T20','T25','T31','T39','T40','T59','T79','T92','T93','T95','TA7','TC1','TC2','TD9','TE6','TE8','TG3','TG4','TG5','TG8','TH8','TI2','TJ5','TK7','TL8','TL9','TM1')
  RETURNING codigo
) SELECT COUNT(*) AS bitel FROM upd;

-- CLARO
WITH upd AS (
  UPDATE tiendas SET proveedor_id = (SELECT id FROM proveedores WHERE nombre ILIKE 'CLARO' LIMIT 1)
  WHERE codigo IN ('T04','T10','T12','T28','T29','T43','T57','T66','T74','T81','T84','T89','T90','T91','T98','TA2','TC6','TC7','TD1','TD3','TD7','TD8','TF2','TF5','TF6','TI4','TI9','TJ8','TK6','TL2','TL5','TN1','TN5','TO5','TP3','TP6','TP8','TQ1','TQ3')
  RETURNING codigo
) SELECT COUNT(*) AS claro FROM upd;

-- ENTEL
WITH upd AS (
  UPDATE tiendas SET proveedor_id = (SELECT id FROM proveedores WHERE nombre ILIKE 'ENTEL' LIMIT 1)
  WHERE codigo IN ('T16','T18','T53','T70','T71','T83','TC5','TC8','TE3','TG6','TH3','TH4','TH5','TH6','TI1','TI5','TI6','TI7','TI8','TJ3','TJ4','TJ6','TK2','TM7','TO1')
  RETURNING codigo
) SELECT COUNT(*) AS entel FROM upd;

-- CONVERGIA
WITH upd AS (
  UPDATE tiendas SET proveedor_id = (SELECT id FROM proveedores WHERE nombre ILIKE 'CONVERGIA' LIMIT 1)
  WHERE codigo IN ('T14','T32','T41','T42','T46','T72','T85','T87','TA9','TC4','TD2','TD4','TE7','TF7','TF8','TH1','TH2','TH7','TH9','TJ1','TL1','TL2','TL4','TM4','TM9','TN6','TN7','TN8','TN9','TO2','TO3','TO4','TO8','TP2','TP7','ALMACEN W4')
  RETURNING codigo
) SELECT COUNT(*) AS convergia FROM upd;

-- MOVISTAR
WITH upd AS (
  UPDATE tiendas SET proveedor_id = (SELECT id FROM proveedores WHERE nombre ILIKE 'MOVISTAR' LIMIT 1)
  WHERE codigo IN ('T78','TC9','TK1','TK6','TM8')
  RETURNING codigo
) SELECT COUNT(*) AS movistar FROM upd;

-- GTD PERU
WITH upd AS (
  UPDATE tiendas SET proveedor_id = (SELECT id FROM proveedores WHERE nombre ILIKE '%GTD%' LIMIT 1)
  WHERE codigo IN ('TG2','TO6','TO7','TP1','TP4','TQ2')
  RETURNING codigo
) SELECT COUNT(*) AS gtd_peru FROM upd;

-- DITSAC
WITH upd AS (
  UPDATE tiendas SET proveedor_id = (SELECT id FROM proveedores WHERE nombre ILIKE 'DITSAC' LIMIT 1)
  WHERE codigo IN ('TL8','TL9')
  RETURNING codigo
) SELECT COUNT(*) AS ditsac FROM upd;

-- FIBERLUX
WITH upd AS (
  UPDATE tiendas SET proveedor_id = (SELECT id FROM proveedores WHERE nombre ILIKE 'FIBERLUX' LIMIT 1)
  WHERE codigo IN ('TK8')
  RETURNING codigo
) SELECT COUNT(*) AS fiberlux FROM upd;

-- FIBRA AMAZONICA
WITH upd AS (
  UPDATE tiendas SET proveedor_id = (SELECT id FROM proveedores WHERE nombre ILIKE '%AMAZONI%' LIMIT 1)
  WHERE codigo IN ('TL3','TL6')
  RETURNING codigo
) SELECT COUNT(*) AS fibra_amazonica FROM upd;

-- TELCONET (Ecuador)
WITH upd AS (
  UPDATE tiendas SET proveedor_id = (SELECT id FROM proveedores WHERE nombre ILIKE 'TELCONET' LIMIT 1)
  WHERE codigo IN ('TEC01','TEC03','TEC04')
  RETURNING codigo
) SELECT COUNT(*) AS telconet FROM upd;

-- GONET (Ecuador)
WITH upd AS (
  UPDATE tiendas SET proveedor_id = (SELECT id FROM proveedores WHERE nombre ILIKE 'GONET' LIMIT 1)
  WHERE codigo IN ('TEC02')
  RETURNING codigo
) SELECT COUNT(*) AS gonet FROM upd;
