// Helpers de fechas sin dependencias. Trabajamos con strings YYYY-MM-DD para
// evitar problemas de timezone — Firestore guarda las fechas como string en
// todos los lugares donde no necesitamos hora.

function isoFromDate(d: Date): string {
	const año = d.getFullYear();
	const mes = String(d.getMonth() + 1).padStart(2, '0');
	const dia = String(d.getDate()).padStart(2, '0');
	return `${año}-${mes}-${dia}`;
}

// Genera todas las fechas (YYYY-MM-DD) entre `desde` y `hasta`, ambas
// inclusivas. Si `hasta < desde` devuelve [].
export function rangoFechasInclusivo(desde: string, hasta: string): string[] {
	if (hasta < desde) return [];
	const out: string[] = [];
	const start = new Date(`${desde}T00:00:00`);
	const end = new Date(`${hasta}T00:00:00`);
	const cur = new Date(start);
	while (cur <= end) {
		out.push(isoFromDate(cur));
		cur.setDate(cur.getDate() + 1);
	}
	return out;
}

// Suma (o resta) dias a un YYYY-MM-DD, devuelve YYYY-MM-DD. Maneja cambio
// de mes/año correctamente al apoyarse en Date.
export function sumarDiasISO(iso: string, dias: number): string {
	const d = new Date(`${iso}T00:00:00`);
	d.setDate(d.getDate() + dias);
	return isoFromDate(d);
}

// Mapeo manual de meses porque Intl.DateTimeFormat con 'short' en es-AR
// devuelve "sept." (con punto). Es el mismo array que en types/torneo.ts;
// duplicamos para no acoplar este helper a ese modulo.
const MESES_ABREV = [
	'Ene',
	'Feb',
	'Mar',
	'Abr',
	'May',
	'Jun',
	'Jul',
	'Ago',
	'Sep',
	'Oct',
	'Nov',
	'Dic'
];
const DIAS_ABREV = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// "18 Sep · Sáb" — etiqueta compacta para mostrar en grillas de horarios.
export function etiquetaFechaCorta(iso: string): string {
	const d = new Date(`${iso}T00:00:00`);
	return `${d.getDate()} ${MESES_ABREV[d.getMonth()]} · ${DIAS_ABREV[d.getDay()]}`;
}
