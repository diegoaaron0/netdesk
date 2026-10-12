// Textos libres para el seed realista: lo que escribiría un agente o un
// proveedor en los campos de texto de la app.

export const NOMBRES = ['Ana', 'Luis', 'María', 'José', 'Carmen', 'Juan', 'Rocío', 'Pedro', 'Elena', 'Víctor', 'Sandra', 'César',
  'Gloria', 'Óscar', 'Pilar', 'Raúl', 'Teresa', 'Hugo', 'Liliana', 'Walter', 'Claudia', 'Fredy', 'Yolanda', 'Iván', 'Melissa',
  'Edwin', 'Diana', 'Renzo', 'Karen', 'Bruno', 'Silvia', 'Álvaro', 'Nancy', 'Kevin', 'Jessica', 'Wilmer', 'Mónica', 'Franco']
export const APELLIDOS = ['Quispe', 'Flores', 'Sánchez', 'Ramírez', 'García', 'Rodríguez', 'Huamán', 'Chávez', 'Torres', 'Mamani',
  'Vargas', 'Rojas', 'Castillo', 'Gutiérrez', 'Mendoza', 'Ccori', 'Espinoza', 'Ramos', 'Díaz', 'Salazar', 'Cárdenas', 'Paredes',
  'Vásquez', 'Ruiz', 'Delgado', 'Zapata', 'Inga', 'Aguilar', 'Benites', 'Cueva', 'Palacios', 'Yupanqui', 'Ticona', 'Ñahui']

export const RESPUESTAS_PROVEEDOR = [
  'Buen día, se generó el ticket {T}. Se detecta pérdida de señal óptica en el tramo hacia el CTO; se programa visita técnica.',
  'Estimados, se registra la avería con ticket {T}. Se realizó reset remoto del puerto, favor validar servicio.',
  'Se identifica corte de fibra en la zona por trabajos de terceros. Cuadrilla en camino. Ticket {T}.',
  'Ticket {T}. El ONT no reporta en gestión; técnico asignado llegará en las próximas 2 horas.',
  'Recibido. Se escaló a planta externa con ticket {T}. Se observa degradación en el nodo, en revisión.',
  'Ticket {T}: se reconfiguró el perfil de velocidad del servicio. Agradeceremos confirmar la estabilidad.',
  'Se confirma falla masiva en el nodo de la zona. Ticket padre {T}. Tiempo estimado de solución: 3 horas.',
  'Buenas tardes. Se cambió el puerto en el OLT y se refrescó la sesión PPPoE. Ticket {T}.',
  'Atendido con ticket {T}. Se detecta ruido en la línea HFC; técnico realizará cambio de conectores.',
  'Ticket {T}. Se solicitó a la tienda reiniciar el ONT; tras el reinicio se observa sincronización normal.',
]

export const NOTAS_ATC = [
  'Se llamó al 0800. Operador confirma ticket {T} y técnico asignado.',
  'Llamada a mesa de ayuda: indican revisión remota en curso.',
  'Se contactó al N2 por teléfono; confirma que el caso está priorizado.',
  'Operador indica avería masiva en la zona, sin hora estimada aún.',
  'Seguimiento telefónico: técnico en camino, llegada aprox. 1 h.',
  'Se insistió por teléfono; derivan a planta externa.',
]

export const SOLUCIONES: Record<string, string[]> = {
  PROVEEDOR: [
    'Proveedor reemplazó el ONT y validó navegación con la tienda.',
    'Proveedor reparó la fibra en la acometida; servicio restablecido.',
    'Proveedor reconfiguró el puerto en el OLT. Tienda confirma conexión estable.',
    'Técnico del proveedor cambió conectores y patch cord en la caja terminal.',
    'Proveedor solucionó la avería masiva del nodo. Se validó con ping sostenido.',
  ],
  AGENTE: [
    'Se reinició el router y se renovó IP. Servicio restablecido.',
    'Se reconectó el cable de red del switch al router; cajas operativas.',
    'Se cambió el patch cord dañado en el gabinete. Navegación normal.',
    'Se liberó la IP duplicada en la red de la tienda. POS conectados.',
    'Se reinició el ONT con apoyo del administrador. Validado con ping.',
  ],
  INFRAESTRUCTURA: [
    'Infraestructura reemplazó el switch de la tienda.',
    'Infraestructura reconfiguró la VLAN de cajas en el switch.',
    'Infraestructura actualizó el firmware del firewall y restableció el túnel VPN.',
  ],
  ENERGIA_ELECTRICA: [
    'Regresó la energía eléctrica; equipos de red encendieron con normalidad.',
    'El centro comercial restableció la energía. Se validaron cajas y POS.',
  ],
}

export const OBSERVACIONES: Record<string, string[]> = {
  CAIDA_TOTAL: [
    'Administrador reporta que ninguna caja puede facturar.',
    'ONT con luz LOS en rojo según foto enviada por la tienda.',
    'Tienda opera con boleta manual mientras se restablece el servicio.',
    'Caída coincide con trabajos de obra en la vía frente a la tienda.',
  ],
  INTERMITENCIA: [
    'Pérdida de paquetes entre 15% y 30% en ping sostenido.',
    'Los POS se desconectan cada pocos minutos; la tienda reporta lentitud al cobrar.',
    'Intermitencia más fuerte en horas punta.',
  ],
  LENTITUD: [
    'Speedtest muestra 3 Mbps de bajada en un plan de 100 Mbps.',
    'Lentitud general al consultar stock y al facturar.',
  ],
  OTROS: [
    'Falla localizada en un equipo interno de la tienda.',
    'Se coordina con Infraestructura para revisión en sitio.',
  ],
  CORTE_ELECTRICO: [
    'Corte de energía en el centro comercial; tienda a oscuras.',
    'El UPS sostuvo los equipos de red unos minutos.',
    'Administración del mall informa que el corte es por mantenimiento de subestación.',
  ],
}

export const DESCARTES_DETALLE = [
  'Se validó con el administrador: ONT encendido, luz PON parpadeando.',
  'Ping al gateway OK, ping a 8.8.8.8 con pérdida del 100%.',
  'Tracert se corta en el segundo salto (red del proveedor).',
  'Se probó con otra PC conectada directo al router: mismo resultado.',
  'Se reinició el ONT dos veces sin mejora.',
  'Resolución DNS correcta; el problema es de enlace.',
]

export const TIPOS_OTROS = [
  'Switch de tienda dañado', 'Bloqueo de puertos en firewall', 'Falla en access point', 'Cable de red cortado en falso techo',
  'IP duplicada en la red', 'Licencia de VPN vencida',
]
export const OTROS_CLASIFICACION = ['Router / Equipo', 'Sistema / Software', 'Cableado', 'Usuario', 'No clasificado']

export const NOTAS_INFRA = [
  'Se requiere revisión del switch de la tienda.',
  'Posible falla de cableado interno; revisar en sitio.',
  'Revisar configuración del firewall de tienda.',
  'Validar VLAN de cajas; el enlace del proveedor está OK.',
]

export const JUSTIFICACION_REAPERTURA: Record<string, string[]> = {
  TIENDA_SIN_INTERNET: [
    'La tienda vuelve a reportar caída al poco tiempo del cierre.',
    'El servicio volvió a caerse; el proveedor no había terminado el trabajo.',
    'Administrador confirma que las cajas otra vez no facturan.',
  ],
  ERROR_AGENTE: [
    'Se cerró por error un incidente que seguía activo.',
  ],
}
