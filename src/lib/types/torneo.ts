import { z } from 'zod';
import type {
	ArmadoConfig,
	BracketConfig,
	Clasifican,
	GrupoZonas,
	ModalidadZona4,
	ParejaRef,
	TamanoZona
} from './armado';
import {
	clasificanSchema,
	grupoZonasSchema,
	modalidadZona4Schema,
	parejaRefSchema,
	tamanoZonaSchema
} from './armado';

// Esquemas de validacion + tipos del dominio. Los esquemas "input" son los
// datos que entran por formulario; los tipos completos suman id y creadoEn
// (los pone el sistema, no el usuario).

// Torneo: sin campo estado por ahora. Cuando definamos las acciones de
// "abrir / cerrar inscripciones" por categoria podra derivarse a partir
// del estado agregado de sus categorias, o reintroducirse como flag propio.

export const torneoInputSchema = z
	.object({
		nombre: z.string().trim().min(1, 'El nombre es requerido').max(100),
		fechaInicio: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
		fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD')
	})
	.refine((d) => d.fechaFin >= d.fechaInicio, {
		message: 'La fecha fin no puede ser anterior al inicio',
		path: ['fechaFin']
	});

export type TorneoInput = z.infer<typeof torneoInputSchema>;

export type Torneo = TorneoInput & {
	id: string;
	creadoEn: string;
};

// Niveles competitivos de la categoria, de 1ra (mas alta) a 9na.
export const nivelCategoriaSchema = z.enum([
	'1ra',
	'2da',
	'3ra',
	'4ta',
	'5ta',
	'6ta',
	'7ma',
	'8va',
	'9na'
]);
export type NivelCategoria = z.infer<typeof nivelCategoriaSchema>;
export const NIVELES_CATEGORIA: NivelCategoria[] = [
	'1ra',
	'2da',
	'3ra',
	'4ta',
	'5ta',
	'6ta',
	'7ma',
	'8va',
	'9na'
];

export const generoCategoriaSchema = z.enum(['Caballeros', 'Damas', 'Mixto']);
export type GeneroCategoria = z.infer<typeof generoCategoriaSchema>;
export const GENEROS_CATEGORIA: GeneroCategoria[] = ['Caballeros', 'Damas', 'Mixto'];

export const categoriaInputSchema = z.object({
	nivel: nivelCategoriaSchema,
	genero: generoCategoriaSchema,
	cupos: z.number().int().positive().nullable(),
	// cantidadJugadores define el tamano de cada inscripcion (1 = singles,
	// 2 = pareja/dobles, 3+ = equipo). Default 2 para padel. Acota 1..6.
	cantidadJugadores: z.number().int().min(1).max(6),
	// Estructura preferida (opcional). Sirve de default para el armado y se
	// usa para estimar la cantidad de partidos antes de tener inscripciones.
	// Cualquiera de los tres puede quedar sin definir: la estimacion usa el
	// mejor dato disponible.
	tamanoPreferido: tamanoZonaSchema.nullable().optional(),
	modalidadZona4: modalidadZona4Schema.nullable().optional(),
	clasificanPorZona: clasificanSchema.nullable().optional(),
	// Estructura personalizada (opcional). Si esta definida, manda sobre
	// los campos simples de arriba al armar y al estimar. Permite mezclar
	// zonas de distintos tamanos / modalidades / clasifican en una misma
	// categoria (ej. 2 zonas de 4 + 5 zonas de 3). Los campos simples
	// quedan como fallback si despues se vuelve al modo simple sin
	// perder lo configurado.
	estructuraPersonalizada: z.array(grupoZonasSchema).nullable().optional()
});

export type CategoriaInput = z.infer<typeof categoriaInputSchema>;

export type Categoria = CategoriaInput & {
	id: string;
	torneoId: string;
	creadoEn: string;
	// Si la categoria fue armada en zonas, guardamos la config usada. null o
	// undefined => no armada. Solo lo toca el servicio de armado, no el form
	// de CategoriaForm.
	armadoConfig?: ArmadoConfig | null;
	// Idem para el bracket eliminatorio. null o undefined => no armado.
	bracketConfig?: BracketConfig | null;
	// Override manual de cruces del cuadro. Se persiste DESDE el preview o
	// desde el editor del bracket armado. Cuando se arma (o re-arma) el
	// bracket, este override se usa via armarBracketDesdeSlots. Se mantiene
	// independiente de bracketConfig para que pueda configurarse antes de
	// armar el bracket real (cuando las zonas aun no terminaron).
	bracketSlotsOverride?: (ParejaRef | null)[] | null;
};

// Nombre derivado a partir de nivel + genero. Se usa en todas las vistas
// para no tener "${nivel} ${genero}" repartido por la UI.
export function nombreCategoria(c: {
	nivel: NivelCategoria;
	genero: GeneroCategoria;
}): string {
	return `${c.nivel} ${c.genero}`;
}

// Sustantivo deporte-agnostico para una inscripcion segun la cantidad de
// jugadores por equipo. Se usa en titulos ("Nueva pareja" vs "Nuevo equipo")
// y mensajes ("?Eliminar la pareja...?").
export function sustantivoInscripcion(cantidadJugadores: number): string {
	if (cantidadJugadores <= 1) return 'jugador';
	if (cantidadJugadores === 2) return 'pareja';
	return 'equipo';
}

// Para compatibilidad con categorias creadas antes del campo. Si no esta
// definido, asumimos 2 (padel) — es el deporte para el que arrancamos.
export function obtenerCantidadJugadores(c: { cantidadJugadores?: number }): number {
	return c.cantidadJugadores ?? 2;
}

// Formato compacto de fecha: "18 Sep 26". Mapeo manual de meses porque
// Intl.DateTimeFormat con 'short' en es-AR devuelve "sept." con punto y
// minuscula, que no es el formato deseado.
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

export function formatearFecha(iso: string): string {
	const d = new Date(iso + 'T00:00:00');
	return `${d.getDate()} ${MESES_ABREV[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
}

// Rango de fechas para un torneo: "18 Sep 26 al 20 Sep 26", o solo una si
// inicio == fin.
export function rangoFechasTorneo(inicioIso: string, finIso: string): string {
	if (inicioIso === finIso) return formatearFecha(inicioIso);
	return `${formatearFecha(inicioIso)} al ${formatearFecha(finIso)}`;
}
