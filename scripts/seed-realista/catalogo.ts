// Catálogo de locales para el seed realista (scripts/seed-realista.ts).
// Centros comerciales y calles reales del Perú; los números de local, los
// administradores y los teléfonos son inventados.

export interface LocalCatalogo {
  nombreCc: string
  formato: 'MALL' | 'PUERTA CALLE' | 'STRIP CENTER'
  direccion: string
  distrito: string
  provincia: string
  coordenadas: string
}

const L = (nombreCc: string, formato: LocalCatalogo['formato'], direccion: string, distrito: string, provincia: string, coordenadas: string): LocalCatalogo =>
  ({ nombreCc, formato, direccion, distrito, provincia, coordenadas })

// ── Lima (90) ────────────────────────────────────────────────────────────────
export const LIMA: LocalCatalogo[] = [
  L('CC Jockey Plaza', 'MALL', 'Av. Javier Prado Este 4200', 'Santiago de Surco', 'Lima', '-12.0856,-76.9770'),
  L('CC Jockey Plaza', 'MALL', 'Av. Javier Prado Este 4200 — Bulevar', 'Santiago de Surco', 'Lima', '-12.0849,-76.9762'),
  L('CC Jockey Plaza', 'MALL', 'Av. Javier Prado Este 4200 — Zona Rímac', 'Santiago de Surco', 'Lima', '-12.0861,-76.9779'),
  L('CC MegaPlaza Independencia', 'MALL', 'Av. Alfredo Mendiola 3698', 'Independencia', 'Lima', '-11.9937,-77.0619'),
  L('CC MegaPlaza Independencia', 'MALL', 'Av. Alfredo Mendiola 3698 — Pabellón B', 'Independencia', 'Lima', '-11.9941,-77.0612'),
  L('CC MegaPlaza Villa El Salvador', 'MALL', 'Av. Pastor Sevilla s/n, Sector 2', 'Villa El Salvador', 'Lima', '-12.2132,-76.9412'),
  L('CC Plaza Norte', 'MALL', 'Av. Alfredo Mendiola 1400', 'Independencia', 'Lima', '-12.0066,-77.0593'),
  L('CC Plaza Norte', 'MALL', 'Av. Alfredo Mendiola 1400 — Nivel 2', 'Independencia', 'Lima', '-12.0063,-77.0588'),
  L('CC Plaza Norte', 'MALL', 'Av. Tomás Valle 1500 — Hipermercado', 'Independencia', 'Lima', '-12.0072,-77.0601'),
  L('CC Mall del Sur', 'MALL', 'Av. Los Lírios 301', 'San Juan de Miraflores', 'Lima', '-12.1546,-76.9814'),
  L('CC Mall del Sur', 'MALL', 'Av. Los Lírios 301 — Nivel 2', 'San Juan de Miraflores', 'Lima', '-12.1541,-76.9809'),
  L('CC Real Plaza Salaverry', 'MALL', 'Av. Gral. Felipe Salaverry 2370', 'Jesús María', 'Lima', '-12.0896,-77.0523'),
  L('CC Real Plaza Salaverry', 'MALL', 'Av. Gral. Felipe Salaverry 2370 — Nivel 3', 'Jesús María', 'Lima', '-12.0893,-77.0519'),
  L('CC Real Plaza Primavera', 'MALL', 'Av. Angamos Este 2681', 'San Borja', 'Lima', '-12.1110,-76.9997'),
  L('CC Real Plaza Centro Cívico', 'MALL', 'Av. Garcilaso de la Vega 1337', 'Cercado de Lima', 'Lima', '-12.0566,-77.0369'),
  L('CC Real Plaza Puruchuco', 'MALL', 'Av. Javier Prado Este 8680', 'Ate', 'Lima', '-12.0396,-76.9263'),
  L('CC Real Plaza Puruchuco', 'MALL', 'Av. Javier Prado Este 8680 — Nivel 2', 'Ate', 'Lima', '-12.0392,-76.9258'),
  L('CC Real Plaza Pro', 'MALL', 'Av. Alfredo Mendiola 7026', 'Los Olivos', 'Lima', '-11.9431,-77.0645'),
  L('CC Real Plaza Villa María', 'MALL', 'Av. Pachacútec 3721', 'Villa María del Triunfo', 'Lima', '-12.1643,-76.9529'),
  L('CC Real Plaza Guardia Civil', 'MALL', 'Av. Guardia Civil 1035', 'Chorrillos', 'Lima', '-12.1736,-77.0081'),
  L('CC Real Plaza Santa Clara', 'MALL', 'Av. Nicolás Ayllón 8694', 'Ate', 'Lima', '-12.0129,-76.8879'),
  L('CC Larcomar', 'MALL', 'Malecón de la Reserva 610', 'Miraflores', 'Lima', '-12.1318,-77.0302'),
  L('CC Open Plaza Angamos', 'MALL', 'Av. Angamos Este 1803', 'Surquillo', 'Lima', '-12.1129,-77.0129'),
  L('CC Open Plaza Atocongo', 'MALL', 'Av. Circunvalación 1803', 'San Juan de Miraflores', 'Lima', '-12.1446,-76.9822'),
  L('CC Open Plaza Canta Callao', 'MALL', 'Av. Canta Callao cdra. 3', 'Los Olivos', 'Lima', '-11.9675,-77.0921'),
  L('CC Plaza San Miguel', 'MALL', 'Av. La Marina 2000', 'San Miguel', 'Lima', '-12.0773,-77.0829'),
  L('CC Plaza San Miguel', 'MALL', 'Av. La Marina 2000 — Nivel 2', 'San Miguel', 'Lima', '-12.0769,-77.0824'),
  L('CC Plaza Lima Sur', 'MALL', 'Av. Prolongación Paseo de la República s/n', 'Chorrillos', 'Lima', '-12.1720,-77.0119'),
  L('CC Mall Aventura Santa Anita', 'MALL', 'Av. Carretera Central 111', 'Santa Anita', 'Lima', '-12.0566,-76.9719'),
  L('CC Mall Aventura Santa Anita', 'MALL', 'Av. Carretera Central 111 — Nivel 2', 'Santa Anita', 'Lima', '-12.0561,-76.9713'),
  L('CC Mall Aventura San Juan de Lurigancho', 'MALL', 'Av. Próceres de la Independencia 2052', 'San Juan de Lurigancho', 'Lima', '-12.0068,-77.0052'),
  L('CC Mall Plaza Comas', 'MALL', 'Av. Los Ángeles 602', 'Comas', 'Lima', '-11.9407,-77.0571'),
  L('CC Mall Plaza Bellavista', 'MALL', 'Av. Óscar R. Benavides 3866', 'Bellavista', 'Callao', '-12.0573,-77.1023'),
  L('CC Minka', 'MALL', 'Av. Argentina 3093', 'Callao', 'Callao', '-12.0491,-77.1189'),
  L('CC La Rambla San Borja', 'MALL', 'Av. Javier Prado Este 2050', 'San Borja', 'Lima', '-12.0891,-77.0058'),
  L('CC La Rambla Breña', 'MALL', 'Av. Brasil 714', 'Breña', 'Lima', '-12.0628,-77.0478'),
  L('CC Plaza Center Norte', 'MALL', 'Av. Túpac Amaru 2195', 'Comas', 'Lima', '-11.9618,-77.0526'),
  L('CC Centro Comercial Arenales', 'MALL', 'Av. Arenales 1737', 'Lince', 'Lima', '-12.0832,-77.0362'),
  L('CC Caminos del Inca', 'MALL', 'Av. Caminos del Inca 257', 'Santiago de Surco', 'Lima', '-12.1134,-76.9921'),
  L('CC El Polo', 'MALL', 'Av. El Polo 670', 'Santiago de Surco', 'Lima', '-12.0947,-76.9706'),
  L('CC Plaza Vea Chorrillos', 'MALL', 'Av. Defensores del Morro 1280', 'Chorrillos', 'Lima', '-12.1872,-77.0103'),
  L('CC Real Plaza Huaral', 'MALL', 'Av. Chancay 1001', 'Huaral', 'Huaral', '-11.4977,-77.2069'),
  L('CC Mega Plaza Cañete', 'MALL', 'Av. Mariscal Benavides 1170', 'San Vicente de Cañete', 'Cañete', '-13.0773,-76.3874'),
  L('CC Plaza Norte', 'MALL', 'Av. Alfredo Mendiola 1400 — Food Court', 'Independencia', 'Lima', '-12.0069,-77.0597'),
  L('CC MegaPlaza Independencia', 'MALL', 'Av. Industrial 3515 — Pabellón Moda', 'Independencia', 'Lima', '-11.9933,-77.0624'),
  L('CC Real Plaza Primavera', 'MALL', 'Av. Angamos Este 2681 — Nivel 2', 'San Borja', 'Lima', '-12.1106,-76.9992'),
  L('CC Open Plaza Angamos', 'MALL', 'Av. Angamos Este 1803 — Nivel 2', 'Surquillo', 'Lima', '-12.1125,-77.0124'),
  L('CC Mall del Sur', 'MALL', 'Av. Pedro Miotta 1220 — Zona Outlet', 'San Juan de Miraflores', 'Lima', '-12.1552,-76.9821'),
  L('CC Mall Plaza Comas', 'MALL', 'Av. Los Ángeles 602 — Nivel 2', 'Comas', 'Lima', '-11.9402,-77.0566'),
  L('CC Real Plaza Centro Cívico', 'MALL', 'Av. Inca Garcilaso de la Vega 1337 — Nivel 2', 'Cercado de Lima', 'Lima', '-12.0562,-77.0364'),
  L('Puerta Calle Jr. de la Unión', 'PUERTA CALLE', 'Jr. de la Unión 615', 'Cercado de Lima', 'Lima', '-12.0478,-77.0335'),
  L('Puerta Calle Jr. de la Unión II', 'PUERTA CALLE', 'Jr. de la Unión 870', 'Cercado de Lima', 'Lima', '-12.0503,-77.0346'),
  L('Puerta Calle Av. Larco', 'PUERTA CALLE', 'Av. José Larco 750', 'Miraflores', 'Lima', '-12.1252,-77.0297'),
  L('Puerta Calle Av. Grau', 'PUERTA CALLE', 'Av. Miguel Grau 1201', 'Cercado de Lima', 'Lima', '-12.0598,-77.0287'),
  L('Puerta Calle Gamarra', 'PUERTA CALLE', 'Jr. Gamarra 778', 'La Victoria', 'Lima', '-12.0669,-77.0137'),
  L('Puerta Calle Gamarra II', 'PUERTA CALLE', 'Jr. Antonio Bazo 1005', 'La Victoria', 'Lima', '-12.0681,-77.0129'),
  L('Puerta Calle Av. Abancay', 'PUERTA CALLE', 'Av. Abancay 456', 'Cercado de Lima', 'Lima', '-12.0507,-77.0279'),
  L('Puerta Calle Av. Brasil', 'PUERTA CALLE', 'Av. Brasil 1420', 'Jesús María', 'Lima', '-12.0712,-77.0483'),
  L('Puerta Calle Av. Benavides', 'PUERTA CALLE', 'Av. Alfredo Benavides 3720', 'Santiago de Surco', 'Lima', '-12.1268,-76.9978'),
  L('Puerta Calle Av. Wiesse', 'PUERTA CALLE', 'Av. Fernando Wiesse 2215', 'San Juan de Lurigancho', 'Lima', '-11.9763,-76.9989'),
  L('Puerta Calle Av. Próceres', 'PUERTA CALLE', 'Av. Próceres de la Independencia 1580', 'San Juan de Lurigancho', 'Lima', '-12.0129,-77.0077'),
  L('Puerta Calle Av. Universitaria', 'PUERTA CALLE', 'Av. Universitaria 6215', 'Los Olivos', 'Lima', '-11.9665,-77.0789'),
  L('Puerta Calle Av. Túpac Amaru', 'PUERTA CALLE', 'Av. Túpac Amaru 3820', 'Comas', 'Lima', '-11.9447,-77.0590'),
  L('Puerta Calle Av. Los Héroes', 'PUERTA CALLE', 'Av. Los Héroes 645', 'San Juan de Miraflores', 'Lima', '-12.1582,-76.9711'),
  L('Puerta Calle Av. Saenz Peña', 'PUERTA CALLE', 'Av. Sáenz Peña 1520', 'Callao', 'Callao', '-12.0590,-77.1308'),
  L('Puerta Calle Av. Huaylas', 'PUERTA CALLE', 'Av. Defensores del Morro 1830', 'Chorrillos', 'Lima', '-12.1925,-77.0117'),
  L('Puerta Calle Av. Nicolás Ayllón', 'PUERTA CALLE', 'Av. Nicolás Ayllón 5320', 'Ate', 'Lima', '-12.0298,-76.9128'),
  L('Puerta Calle Av. Revolución', 'PUERTA CALLE', 'Av. Revolución 1450', 'Villa El Salvador', 'Lima', '-12.2081,-76.9353'),
  L('Puerta Calle Av. Naranjal', 'PUERTA CALLE', 'Av. Naranjal 1120', 'Los Olivos', 'Lima', '-11.9784,-77.0687'),
  L('Puerta Calle Mesa Redonda', 'PUERTA CALLE', 'Jr. Andahuaylas 762', 'Cercado de Lima', 'Lima', '-12.0533,-77.0237'),
  L('Puerta Calle Av. Tacna', 'PUERTA CALLE', 'Av. Tacna 620', 'Cercado de Lima', 'Lima', '-12.0496,-77.0364'),
  L('Puerta Calle Huacho', 'PUERTA CALLE', 'Av. 28 de Julio 345', 'Huacho', 'Huaura', '-11.1078,-77.6102'),
  L('Puerta Calle Chosica', 'PUERTA CALLE', 'Av. Lima Sur 1020', 'Lurigancho-Chosica', 'Lima', '-11.9364,-76.6967'),
  L('Puerta Calle Av. Angélica Gamarra', 'PUERTA CALLE', 'Av. Angélica Gamarra 1260', 'Los Olivos', 'Lima', '-11.9908,-77.0745'),
  L('Puerta Calle Av. Perú', 'PUERTA CALLE', 'Av. Perú 3480', 'San Martín de Porres', 'Lima', '-12.0279,-77.0751'),
  L('Puerta Calle Av. Pachacútec', 'PUERTA CALLE', 'Av. Pachacútec 2240', 'Villa María del Triunfo', 'Lima', '-12.1601,-76.9561'),
  L('Strip Center Las Begonias', 'STRIP CENTER', 'Calle Las Begonias 545', 'San Isidro', 'Lima', '-12.0937,-77.0234'),
  L('Strip Center La Fontana', 'STRIP CENTER', 'Av. La Fontana 790', 'La Molina', 'Lima', '-12.0752,-76.9533'),
  L('Strip Center Camacho', 'STRIP CENTER', 'Av. Javier Prado Este 5268', 'La Molina', 'Lima', '-12.0789,-76.9618'),
  L('Strip Center Chacarilla', 'STRIP CENTER', 'Av. Primavera 645', 'Santiago de Surco', 'Lima', '-12.1092,-76.9925'),
  L('Strip Center San Felipe', 'STRIP CENTER', 'Av. Gregorio Escobedo 803', 'Jesús María', 'Lima', '-12.0832,-77.0544'),
  L('Strip Center Precursores', 'STRIP CENTER', 'Av. Precursores 450', 'San Miguel', 'Lima', '-12.0817,-77.0915'),
  L('Strip Center Higuereta', 'STRIP CENTER', 'Av. Tomás Marsano 3920', 'Santiago de Surco', 'Lima', '-12.1340,-77.0028'),
  L('Strip Center Pueblo Libre', 'STRIP CENTER', 'Av. Sucre 1120', 'Pueblo Libre', 'Lima', '-12.0753,-77.0634'),
  L('Strip Center Lurín', 'STRIP CENTER', 'Antigua Panamericana Sur km 36', 'Lurín', 'Lima', '-12.2741,-76.8699'),
  L('Strip Center Carabayllo', 'STRIP CENTER', 'Av. Túpac Amaru km 22', 'Carabayllo', 'Lima', '-11.8833,-77.0414'),
  L('Strip Center Ventanilla', 'STRIP CENTER', 'Av. Néstor Gambetta 6780', 'Ventanilla', 'Callao', '-11.8739,-77.1290'),
  L('Strip Center Puente Piedra', 'STRIP CENTER', 'Av. Panamericana Norte km 31', 'Puente Piedra', 'Lima', '-11.8656,-77.0749'),
  L('Strip Center Barranco', 'STRIP CENTER', 'Av. Grau 320', 'Barranco', 'Lima', '-12.1466,-77.0202'),
  L('Strip Center Magdalena', 'STRIP CENTER', 'Av. Javier Prado Oeste 1650', 'Magdalena del Mar', 'Lima', '-12.0931,-77.0647'),
]

// ── Provincias (60) ──────────────────────────────────────────────────────────
export const PROVINCIAS: LocalCatalogo[] = [
  // Arequipa (12)
  L('CC Mall Aventura Porongoche', 'MALL', 'Av. Porongoche 500', 'Paucarpata', 'Arequipa', '-16.4196,-71.5174'),
  L('CC Mall Aventura Porongoche', 'MALL', 'Av. Porongoche 500 — Nivel 2', 'Paucarpata', 'Arequipa', '-16.4192,-71.5169'),
  L('CC Real Plaza Arequipa', 'MALL', 'Av. Ejército 793', 'Cayma', 'Arequipa', '-16.3893,-71.5482'),
  L('CC Real Plaza Arequipa', 'MALL', 'Av. Ejército 793 — Nivel 2', 'Cayma', 'Arequipa', '-16.3889,-71.5477'),
  L('CC Parque Lambramani', 'MALL', 'Av. Lambramani 325', 'José Luis Bustamante y Rivero', 'Arequipa', '-16.4211,-71.5258'),
  L('CC Mall Plaza Arequipa', 'MALL', 'Av. Ejército 1009', 'Cayma', 'Arequipa', '-16.3871,-71.5512'),
  L('CC Open Plaza Arequipa', 'MALL', 'Av. Lambramani 325 — Bloque B', 'José Luis Bustamante y Rivero', 'Arequipa', '-16.4206,-71.5251'),
  L('Puerta Calle Mercaderes', 'PUERTA CALLE', 'Calle Mercaderes 142', 'Arequipa', 'Arequipa', '-16.3993,-71.5355'),
  L('Puerta Calle San Juan de Dios', 'PUERTA CALLE', 'Calle San Juan de Dios 208', 'Arequipa', 'Arequipa', '-16.4019,-71.5341'),
  L('Puerta Calle Av. Ejército', 'PUERTA CALLE', 'Av. Ejército 402', 'Yanahuara', 'Arequipa', '-16.3925,-71.5446'),
  L('Puerta Calle Av. Dolores', 'PUERTA CALLE', 'Av. Dolores 210', 'José Luis Bustamante y Rivero', 'Arequipa', '-16.4153,-71.5232'),
  L('Strip Center Cerro Colorado', 'STRIP CENTER', 'Av. Aviación 602', 'Cerro Colorado', 'Arequipa', '-16.3672,-71.5603'),
  // Trujillo (10)
  L('CC Mall Plaza Trujillo', 'MALL', 'Av. América Oeste 750', 'Trujillo', 'Trujillo', '-8.1229,-79.0383'),
  L('CC Mall Plaza Trujillo', 'MALL', 'Av. América Oeste 750 — Nivel 2', 'Trujillo', 'Trujillo', '-8.1225,-79.0378'),
  L('CC Real Plaza Trujillo', 'MALL', 'Av. César Vallejo Oeste 1345', 'Trujillo', 'Trujillo', '-8.1170,-79.0358'),
  L('CC Real Plaza Trujillo', 'MALL', 'Av. César Vallejo Oeste 1345 — Nivel 2', 'Trujillo', 'Trujillo', '-8.1166,-79.0353'),
  L('CC Mall Aventura Trujillo', 'MALL', 'Av. Mansiche 1220', 'Trujillo', 'Trujillo', '-8.0998,-79.0405'),
  L('CC Open Plaza Trujillo', 'MALL', 'Av. América Norte 1245', 'Trujillo', 'Trujillo', '-8.1032,-79.0219'),
  L('Puerta Calle Jr. Pizarro', 'PUERTA CALLE', 'Jr. Francisco Pizarro 512', 'Trujillo', 'Trujillo', '-8.1109,-79.0277'),
  L('Puerta Calle Av. España', 'PUERTA CALLE', 'Av. España 1820', 'Trujillo', 'Trujillo', '-8.1141,-79.0311'),
  L('Puerta Calle La Esperanza', 'PUERTA CALLE', 'Av. José Gabriel Condorcanqui 1340', 'La Esperanza', 'Trujillo', '-8.0742,-79.0455'),
  L('Strip Center El Golf', 'STRIP CENTER', 'Av. Juan Pablo II 305', 'Víctor Larco Herrera', 'Trujillo', '-8.1290,-79.0451'),
  // Chiclayo (8)
  L('CC Real Plaza Chiclayo', 'MALL', 'Av. Luis Gonzáles 1525', 'Chiclayo', 'Chiclayo', '-6.7681,-79.8441'),
  L('CC Real Plaza Chiclayo', 'MALL', 'Av. Luis Gonzáles 1525 — Nivel 2', 'Chiclayo', 'Chiclayo', '-6.7677,-79.8436'),
  L('CC Open Plaza Chiclayo', 'MALL', 'Av. Miguel de Cervantes 300', 'Chiclayo', 'Chiclayo', '-6.7808,-79.8467'),
  L('CC Mall Aventura Chiclayo', 'MALL', 'Av. Andrés Avelino Cáceres 222', 'José Leonardo Ortiz', 'Chiclayo', '-6.7559,-79.8371'),
  L('CC Mall Aventura Chiclayo', 'MALL', 'Av. Andrés Avelino Cáceres 222 — Nivel 2', 'José Leonardo Ortiz', 'Chiclayo', '-6.7555,-79.8366'),
  L('Puerta Calle Av. Balta', 'PUERTA CALLE', 'Av. José Balta 820', 'Chiclayo', 'Chiclayo', '-6.7719,-79.8394'),
  L('Puerta Calle Elías Aguirre', 'PUERTA CALLE', 'Calle Elías Aguirre 615', 'Chiclayo', 'Chiclayo', '-6.7741,-79.8378'),
  L('Strip Center La Victoria', 'STRIP CENTER', 'Av. Chinchaysuyo 455', 'La Victoria', 'Chiclayo', '-6.7898,-79.8406'),
  // Piura (8)
  L('CC Real Plaza Piura', 'MALL', 'Av. Sánchez Cerro 234', 'Piura', 'Piura', '-5.1879,-80.6327'),
  L('CC Real Plaza Piura', 'MALL', 'Av. Sánchez Cerro 234 — Nivel 2', 'Piura', 'Piura', '-5.1875,-80.6322'),
  L('CC Open Plaza Piura', 'MALL', 'Av. Andrés Avelino Cáceres 147', 'Castilla', 'Piura', '-5.1945,-80.6194'),
  L('CC Plaza de la Luna', 'MALL', 'Av. Grau 1460', 'Piura', 'Piura', '-5.1966,-80.6382'),
  L('CC Plaza de la Luna', 'MALL', 'Av. Grau 1460 — Nivel 2', 'Piura', 'Piura', '-5.1962,-80.6377'),
  L('Puerta Calle Av. Grau Piura', 'PUERTA CALLE', 'Av. Grau 432', 'Piura', 'Piura', '-5.1958,-80.6301'),
  L('Puerta Calle Sullana', 'PUERTA CALLE', 'Calle San Martín 980', 'Sullana', 'Sullana', '-4.9036,-80.6852'),
  L('Strip Center Los Ejidos', 'STRIP CENTER', 'Av. Chulucanas 120', 'Veintiséis de Octubre', 'Piura', '-5.1802,-80.6531'),
  // Cusco (6)
  L('CC Real Plaza Cusco', 'MALL', 'Av. Collasuyo 2964', 'Wanchaq', 'Cusco', '-13.5300,-71.9466'),
  L('CC Real Plaza Cusco', 'MALL', 'Av. Collasuyo 2964 — Nivel 2', 'Wanchaq', 'Cusco', '-13.5296,-71.9461'),
  L('CC Mall Aventura Cusco', 'MALL', 'Av. de la Cultura 1520', 'San Sebastián', 'Cusco', '-13.5306,-71.9397'),
  L('Puerta Calle Av. El Sol', 'PUERTA CALLE', 'Av. El Sol 345', 'Cusco', 'Cusco', '-13.5195,-71.9776'),
  L('Puerta Calle Portal de Panes', 'PUERTA CALLE', 'Portal de Panes 123', 'Cusco', 'Cusco', '-13.5164,-71.9787'),
  L('Strip Center Av. de la Cultura', 'STRIP CENTER', 'Av. de la Cultura 2410', 'San Sebastián', 'Cusco', '-13.5318,-71.9284'),
  // Huancayo (5)
  L('CC Real Plaza Huancayo', 'MALL', 'Av. Ferrocarril 1035', 'Huancayo', 'Huancayo', '-12.0663,-75.2109'),
  L('CC Real Plaza Huancayo', 'MALL', 'Av. Ferrocarril 1035 — Nivel 2', 'Huancayo', 'Huancayo', '-12.0659,-75.2104'),
  L('CC Open Plaza Huancayo', 'MALL', 'Av. Giráldez 1290', 'Huancayo', 'Huancayo', '-12.0644,-75.2081'),
  L('Puerta Calle Calle Real', 'PUERTA CALLE', 'Calle Real 645', 'Huancayo', 'Huancayo', '-12.0682,-75.2058'),
  L('Puerta Calle El Tambo', 'PUERTA CALLE', 'Av. Huancavelica 1120', 'El Tambo', 'Huancayo', '-12.0551,-75.2137'),
  // Ica (4)
  L('CC Plaza del Sol Ica', 'MALL', 'Av. San Martín 727', 'Ica', 'Ica', '-14.0700,-75.7303'),
  L('CC Real Plaza Ica', 'MALL', 'Av. Los Maestros 206', 'Ica', 'Ica', '-14.0789,-75.7341'),
  L('CC Mega Plaza Ica', 'MALL', 'Av. Los Maestros 500', 'Ica', 'Ica', '-14.0802,-75.7368'),
  L('Puerta Calle Av. Grau Ica', 'PUERTA CALLE', 'Av. Grau 268', 'Ica', 'Ica', '-14.0661,-75.7287'),
  // Tacna (4)
  L('CC Solari Plaza', 'MALL', 'Av. Bolognesi 1205', 'Tacna', 'Tacna', '-18.0079,-70.2441'),
  L('CC Real Plaza Tacna', 'MALL', 'Av. Leguía 1010', 'Tacna', 'Tacna', '-18.0175,-70.2512'),
  L('Puerta Calle Av. San Martín', 'PUERTA CALLE', 'Av. San Martín 620', 'Tacna', 'Tacna', '-18.0141,-70.2509'),
  L('Puerta Calle Paseo Cívico', 'PUERTA CALLE', 'Calle Apurímac 240', 'Tacna', 'Tacna', '-18.0123,-70.2526'),
  // Pucallpa (3)
  L('CC Open Plaza Pucallpa', 'MALL', 'Av. Centenario 2086', 'Yarinacocha', 'Coronel Portillo', '-8.3880,-74.5682'),
  L('CC Real Plaza Pucallpa', 'MALL', 'Jr. Tarapacá 1050', 'Callería', 'Coronel Portillo', '-8.3822,-74.5410'),
  L('Puerta Calle Jr. Raymondi', 'PUERTA CALLE', 'Jr. Raymondi 460', 'Callería', 'Coronel Portillo', '-8.3849,-74.5361'),
]

/** Zona comercial → supervisor zonal de tiendas (Retail, no TI). */
export const SUPERVISORES_ZONALES: Record<string, { nombre: string; celular: string }> = {
  'LIMA NORTE':  { nombre: 'GABRIELA CCAHUANA',  celular: '987341220' },
  'LIMA CENTRO': { nombre: 'MARTIN ALVARADO',    celular: '986557118' },
  'LIMA SUR':    { nombre: 'KARINA VILLANUEVA',  celular: '989204663' },
  'LIMA ESTE':   { nombre: 'HECTOR GAMARRA',     celular: '981776045' },
  'NORTE':       { nombre: 'JULIO SEMINARIO',    celular: '969318502' },
  'SUR':         { nombre: 'MILAGROS ZEGARRA',   celular: '958620774' },
  'ORIENTE':     { nombre: 'RAUL CARDENAS',      celular: '964112389' },
}

const DIST_ZONA: Record<string, string> = {
  'Independencia': 'LIMA NORTE', 'Los Olivos': 'LIMA NORTE', 'Comas': 'LIMA NORTE', 'San Martín de Porres': 'LIMA NORTE',
  'Carabayllo': 'LIMA NORTE', 'Puente Piedra': 'LIMA NORTE', 'Ventanilla': 'LIMA NORTE', 'Huaral': 'LIMA NORTE', 'Huacho': 'LIMA NORTE',
  'Callao': 'LIMA CENTRO', 'Bellavista': 'LIMA CENTRO', 'San Miguel': 'LIMA CENTRO', 'Cercado de Lima': 'LIMA CENTRO',
  'Jesús María': 'LIMA CENTRO', 'Lince': 'LIMA CENTRO', 'Breña': 'LIMA CENTRO', 'La Victoria': 'LIMA CENTRO',
  'Pueblo Libre': 'LIMA CENTRO', 'Magdalena del Mar': 'LIMA CENTRO', 'San Isidro': 'LIMA CENTRO', 'Miraflores': 'LIMA CENTRO',
  'Santiago de Surco': 'LIMA SUR', 'San Juan de Miraflores': 'LIMA SUR', 'Chorrillos': 'LIMA SUR', 'Villa El Salvador': 'LIMA SUR',
  'Villa María del Triunfo': 'LIMA SUR', 'Lurín': 'LIMA SUR', 'Barranco': 'LIMA SUR', 'Surquillo': 'LIMA SUR', 'San Vicente de Cañete': 'LIMA SUR',
  'Ate': 'LIMA ESTE', 'Santa Anita': 'LIMA ESTE', 'San Borja': 'LIMA ESTE', 'La Molina': 'LIMA ESTE',
  'San Juan de Lurigancho': 'LIMA ESTE', 'Lurigancho-Chosica': 'LIMA ESTE',
}
const PROV_ZONA: Record<string, string> = {
  'Trujillo': 'NORTE', 'Chiclayo': 'NORTE', 'Piura': 'NORTE', 'Sullana': 'NORTE',
  'Arequipa': 'SUR', 'Cusco': 'SUR', 'Ica': 'SUR', 'Tacna': 'SUR',
  'Huancayo': 'ORIENTE', 'Coronel Portillo': 'ORIENTE',
}
export function zonaDe(l: LocalCatalogo): string {
  return DIST_ZONA[l.distrito] ?? PROV_ZONA[l.provincia] ?? 'LIMA CENTRO'
}
