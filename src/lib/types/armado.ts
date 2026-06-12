import { z } from 'zod';

// Config del armado de zonas. Vive como prop opcional en Categoria: null = no
// armada todavia. Cuando se arma, se guarda este snapshot para saber con que
// se hizo (algoritmo, tamano preferido, etc.) y para mostrarlo en la UI.

export const algoritmoSchema = z.enum(['snake', 'random']);
export type Algoritmo = z.infer<typeof algoritmoSchema>;

export const modalidadZona4Schema = z.enum(['todosContraTodos', 'dobleOportunidad']);
export type ModalidadZona4 = z.infer<typeof modalidadZona4Schema>;

export const tamanoZonaSchema = z.union([z.literal(3), z.literal(4)]);
export type TamanoZona = z.infer<typeof tamanoZonaSchema>;

// Cuantas parejas clasifican por zona. 3 solo es valido para zonas de 4
// (en zona de 3 no tiene sentido = serian todos). El servicio capea al
// maximo posible segun el tamano cuando persiste el campo en cada zona.
export const clasificanSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type Clasifican = z.infer<typeof clasificanSchema>;

export const armadoConfigSchema = z.object({
	algoritmo: algoritmoSchema,
	tamanoPreferido: tamanoZonaSchema,
	modalidadZona4: modalidadZona4Schema,
	clasificanPorZona: clasificanSchema,
	armadoEn: z.string()
});
export type ArmadoConfig = z.infer<typeof armadoConfigSchema>;

// Referencia a una "pareja" (=inscripcion) en un partido. Puede ser:
// - directa por id de inscripcion;
// - simbolica: "ganador/perdedor del partido N" (donde N es el
//   numeroEnZona del partido referenciado dentro de su contexto — zona
//   en fase de grupos, bracket en fase eliminatoria);
// - posicional: "X° de zona Y" (solo en bracket; se resuelve cuando la
//   zona termina y la tabla de posiciones esta definida).
export type ParejaRef =
	| { tipo: 'Inscripcion'; inscripcionId: string }
	| { tipo: 'GanadorPartido'; numeroEnZona: number }
	| { tipo: 'PerdedorPartido'; numeroEnZona: number }
	| { tipo: 'PosicionZona'; letraZona: string; posicion: 1 | 2 | 3 };

// Estado de una zona armada. La modalidad y clasifican se guardan en la
// propia zona (no solo en la config macro de la categoria) porque despues
// permitimos re-armar UNA zona individual con distintos parametros (caso de
// la pareja que llega tarde y la zona pasa de 3 a 4 con DO).
export type Zona = {
	id: string;
	categoriaId: string;
	letra: string;
	tamano: TamanoZona;
	modalidad: ModalidadZona4 | 'todosContraTodos'; // zonas de 3 siempre RR
	clasifican: Clasifican;
	inscripcionIds: string[];
	creadoEn: string;
};

// Fases del torneo. Los rotulos del bracket usan abreviaturas en castellano:
// 16vos, 8vos, 4tos, Semis, Final. Los partidos previos a 16vos en cuadros
// grandes se rotulan como "32vos" (no soportado hoy en la UI). Esto es lo
// que se persiste en Firestore.
export type FasePartido =
	| 'Zona'
	| '32vos'
	| '16vos'
	| '8vos'
	| '4tos'
	| 'Semis'
	| 'Final';

export type EstadoPartido = 'Pendiente' | 'Programado' | 'Jugado';

// Motivo del resultado:
// - normal: se jugo el partido completo.
// - WO (walkover): una pareja no se presento; la otra gana sin jugar.
// - abandono: la pareja perdedora abandono durante el partido.
export const motivoResultadoSchema = z.enum(['normal', 'WO', 'abandono']);
export type MotivoResultado = z.infer<typeof motivoResultadoSchema>;

// Set con games ganados por cada pareja. Tiebreak opcional cuando hubo
// (set 6-6 se resuelve con tiebreak; el ganador del tie se anota 7 games).
export const setResultadoSchema = z.object({
	p1: z.number().int().min(0).max(99),
	p2: z.number().int().min(0).max(99),
	tiebreakP1: z.number().int().min(0).optional(),
	tiebreakP2: z.number().int().min(0).optional()
});
export type SetResultado = z.infer<typeof setResultadoSchema>;

export const resultadoPartidoSchema = z.object({
	sets: z.array(setResultadoSchema),
	ganadorEs: z.union([z.literal(1), z.literal(2)]),
	motivo: motivoResultadoSchema
});
export type ResultadoPartido = z.infer<typeof resultadoPartidoSchema>;

// Asignacion de fecha+hora+cancha al partido. null/undefined = sin programar.
// Se gestiona desde /torneos/[id]/programacion.
export type ProgramacionPartido = {
	fecha: string; // YYYY-MM-DD
	hora: string; // HH:mm
	canchaId: string; // referencia a la cancha (no a TorneoCancha)
};

export type Partido = {
	id: string;
	categoriaId: string;
	// zonaId !== null  → partido de fase de grupos.
	// bracketId !== null → partido del bracket eliminatorio.
	// Solo uno de los dos esta seteado a la vez.
	zonaId: string | null;
	bracketId?: string | null;
	fase: FasePartido;
	// Numero del partido dentro de su contexto (zona o bracket). Es la base
	// del esquema de refs simbolicas ("Ganador P3" apunta a partido con
	// numeroEnZona=3 dentro del mismo contexto).
	numeroEnZona: number;
	// Solo bracket: ronda (1=primera ronda real del cuadro), posicion dentro
	// de la ronda (1, 2, ...). Sirven para ordenar y mostrar.
	ronda?: number;
	posicionEnRonda?: number;
	pareja1Ref: ParejaRef;
	pareja2Ref: ParejaRef;
	resultado: ResultadoPartido | null;
	estado: EstadoPartido;
	// null/undefined = sin programar. Cuando esta seteado, el partido tiene
	// fecha/hora/cancha asignadas (no implica que se haya jugado todavia).
	programacion?: ProgramacionPartido | null;
	creadoEn: string;
};

// Config del bracket. Snapshot guardado en Categoria.bracketConfig cuando
// se arma. Solo necesitamos saber cuantas parejas entraron al cuadro (para
// reconstruir/mostrar el cuadro sin recalcular todo).
export const bracketConfigSchema = z.object({
	cantidadParejas: z.number().int().min(2).max(64),
	armadoEn: z.string()
});
export type BracketConfig = z.infer<typeof bracketConfigSchema>;

// "Plantilla" de zona armada, antes de persistirla (sin id/creadoEn). El
// algoritmo devuelve este shape; el servicio le pone los ids y la guarda.
export type ZonaArmada = {
	letra: string;
	tamano: TamanoZona;
	inscripcionIds: string[]; // en orden de "posicion interna" (1°, 2°, ...)
};

// "Plantilla" de partido generado, antes de persistirlo (sin id/zonaId/
// categoriaId/creadoEn). El servicio los completa.
export type PartidoPlantilla = {
	numeroEnZona: number;
	pareja1Ref: ParejaRef;
	pareja2Ref: ParejaRef;
};
