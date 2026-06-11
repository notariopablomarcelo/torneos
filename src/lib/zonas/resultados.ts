import type {
	ParejaRef,
	Partido,
	ResultadoPartido,
	Zona
} from '$lib/types/armado';

// ===========================================================================
// Resolucion de refs simbolicas
// ===========================================================================

// Dada una ParejaRef (puede ser directa o simbolica GanadorPartido/Perdedor)
// y los partidos de la categoria, intenta devolver el inscripcionId concreto
// al que apunta. Devuelve null si todavia no se puede resolver (el partido
// referenciado no se jugo o tampoco se puede resolver el suyo).
//
// Implementacion recursiva: para resolver "Ganador de P3" necesitamos saber
// quien gano P3, lo cual puede requerir resolver "Ganador de P1" si la ref
// de P3 era simbolica. En la practica en zona solo hay un nivel de
// indireccion (los partidos 3 y 4 de DO apuntan a partidos 1 y 2 que son
// directos), pero la recursion lo cubre por si en el futuro hay mas.
export function resolverParejaRef(
	ref: ParejaRef,
	partidos: Partido[]
): string | null {
	if (ref.tipo === 'Inscripcion') return ref.inscripcionId;

	const partidoRef = partidos.find((p) => p.numeroEnZona === ref.numeroEnZona);
	if (!partidoRef || !partidoRef.resultado) return null;

	const refGanadora =
		partidoRef.resultado.ganadorEs === 1
			? partidoRef.pareja1Ref
			: partidoRef.pareja2Ref;
	const refPerdedora =
		partidoRef.resultado.ganadorEs === 1
			? partidoRef.pareja2Ref
			: partidoRef.pareja1Ref;

	if (ref.tipo === 'GanadorPartido') {
		return resolverParejaRef(refGanadora, partidos);
	}
	return resolverParejaRef(refPerdedora, partidos);
}

// Atajos para el caso comun: dado un partido, dame quien gano / quien perdio.
// Devuelve inscripcionId o null si todavia no se cargo el resultado.
export function ganadorDePartido(partido: Partido, partidos: Partido[]): string | null {
	if (!partido.resultado) return null;
	const ref =
		partido.resultado.ganadorEs === 1 ? partido.pareja1Ref : partido.pareja2Ref;
	return resolverParejaRef(ref, partidos);
}

export function perdedorDePartido(partido: Partido, partidos: Partido[]): string | null {
	if (!partido.resultado) return null;
	const ref =
		partido.resultado.ganadorEs === 1 ? partido.pareja2Ref : partido.pareja1Ref;
	return resolverParejaRef(ref, partidos);
}

// ===========================================================================
// Tabla de posiciones de una zona
// ===========================================================================

export type FilaTabla = {
	inscripcionId: string;
	posicionInicial: number; // 1, 2, 3 o 4 segun el orden interno de la zona
	pj: number; // partidos jugados (con resultado cargado)
	pg: number; // partidos ganados
	pp: number; // partidos perdidos
	sf: number; // sets a favor
	sc: number; // sets en contra
	gf: number; // games a favor
	gc: number; // games en contra
	difSets: number;
	difGames: number;
};

// Cuenta sets y games totales en un resultado. W.O.: no suma sets/games
// (el resultado representa "no jugado"); solo PG/PP se cuentan afuera.
function contarSetsGames(resultado: ResultadoPartido): {
	sets1: number;
	sets2: number;
	games1: number;
	games2: number;
} {
	if (resultado.motivo === 'WO') {
		return { sets1: 0, sets2: 0, games1: 0, games2: 0 };
	}
	let sets1 = 0;
	let sets2 = 0;
	let games1 = 0;
	let games2 = 0;
	for (const s of resultado.sets) {
		games1 += s.p1;
		games2 += s.p2;
		if (s.p1 > s.p2) sets1 += 1;
		else if (s.p2 > s.p1) sets2 += 1;
	}
	return { sets1, sets2, games1, games2 };
}

// Tabla de posiciones de una zona. Orden FAP:
// 1. PG descendente.
// 2. Diferencia de sets (sf - sc) descendente.
// 3. Diferencia de games (gf - gc) descendente.
// 4. Posicion inicial (mantiene snake como desempate final).
export function calcularTablaPosiciones(zona: Zona, partidos: Partido[]): FilaTabla[] {
	const filas = new Map<string, FilaTabla>();
	zona.inscripcionIds.forEach((inscId, idx) => {
		filas.set(inscId, {
			inscripcionId: inscId,
			posicionInicial: idx + 1,
			pj: 0,
			pg: 0,
			pp: 0,
			sf: 0,
			sc: 0,
			gf: 0,
			gc: 0,
			difSets: 0,
			difGames: 0
		});
	});

	const partidosDeZona = partidos.filter(
		(p) => p.zonaId === zona.id && p.resultado !== null
	);

	for (const partido of partidosDeZona) {
		const pareja1Id = resolverParejaRef(partido.pareja1Ref, partidos);
		const pareja2Id = resolverParejaRef(partido.pareja2Ref, partidos);
		if (!pareja1Id || !pareja2Id) continue;
		const fila1 = filas.get(pareja1Id);
		const fila2 = filas.get(pareja2Id);
		// Si una de las parejas no es de esta zona (no deberia pasar) saltamos.
		if (!fila1 || !fila2) continue;

		const r = partido.resultado!;
		const { sets1, sets2, games1, games2 } = contarSetsGames(r);

		fila1.pj += 1;
		fila2.pj += 1;
		fila1.sf += sets1;
		fila1.sc += sets2;
		fila2.sf += sets2;
		fila2.sc += sets1;
		fila1.gf += games1;
		fila1.gc += games2;
		fila2.gf += games2;
		fila2.gc += games1;

		if (r.ganadorEs === 1) {
			fila1.pg += 1;
			fila2.pp += 1;
		} else {
			fila2.pg += 1;
			fila1.pp += 1;
		}
	}

	for (const fila of filas.values()) {
		fila.difSets = fila.sf - fila.sc;
		fila.difGames = fila.gf - fila.gc;
	}

	return Array.from(filas.values()).sort((a, b) => {
		if (a.pg !== b.pg) return b.pg - a.pg;
		if (a.difSets !== b.difSets) return b.difSets - a.difSets;
		if (a.difGames !== b.difGames) return b.difGames - a.difGames;
		return a.posicionInicial - b.posicionInicial;
	});
}

// ===========================================================================
// Estado derivado de la zona
// ===========================================================================

export type EstadoZona = 'Pendiente' | 'EnCurso' | 'Finalizada';

export function estadoZona(zona: Zona, partidos: Partido[]): EstadoZona {
	const partidosDeZona = partidos.filter((p) => p.zonaId === zona.id);
	if (partidosDeZona.length === 0) return 'Pendiente';
	const jugados = partidosDeZona.filter((p) => p.resultado !== null).length;
	if (jugados === 0) return 'Pendiente';
	if (jugados === partidosDeZona.length) return 'Finalizada';
	return 'EnCurso';
}

// ===========================================================================
// Inferencia automatica del ganador desde los sets
// ===========================================================================

// Cuenta sets ganados por cada pareja. Util para el form: cuando el user
// carga los sets, podemos sugerir/forzar el ganadorEs sin que tenga que
// elegirlo a mano.
export function ganadorInferido(
	sets: { p1: number; p2: number }[]
): 1 | 2 | null {
	let s1 = 0;
	let s2 = 0;
	for (const s of sets) {
		if (s.p1 > s.p2) s1 += 1;
		else if (s.p2 > s.p1) s2 += 1;
	}
	if (s1 === s2) return null;
	return s1 > s2 ? 1 : 2;
}
