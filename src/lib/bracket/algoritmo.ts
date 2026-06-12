import type { Clasifican, ParejaRef, PartidoPlantilla } from '$lib/types/armado';

// =============================================================================
// Sembrado snake del bracket eliminatorio
// =============================================================================
//
// Reglas:
// 1. Clasificados se ordenan por "cabeza de serie" (seeds): primero todos los
//    1° por orden de zona (A, B, ...), despues todos los 2°, despues 3°.
// 2. Si la cantidad TOTAL no es potencia de 2, el cuadro se eleva a la
//    SIGUIENTE potencia de 2 (4, 8, 16, 32...) y se otorgan byes a los
//    mejores seeds (los 1°). En la 1ra ronda, los 1° pasan directo a la
//    siguiente; los 2° y 3° juegan entre ellos.
// 3. Si la cantidad ya es potencia de 2 (4, 8, 16), todos juegan la 1ra ronda
//    sin byes.
//
// Sembrado estandar "tennis seeding":
//   seeds(2) = [1, 2]
//   seeds(N) = entrelazar(seeds(N/2), reverse(map(s => N+1-s, seeds(N/2))))
//   N=4:  [1, 4, 2, 3]
//   N=8:  [1, 8, 4, 5, 2, 7, 3, 6]
//   N=16: [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]
//
// Los partidos de 1ra ronda salen tomando pares consecutivos del array. Si
// alguno de los dos seeds del par es > N (seed "imaginario"), no se crea
// partido: el seed real pasa directo (bye).

// =============================================================================
// API publica
// =============================================================================

export type ClasificadoSeed = {
	letraZona: string;
	posicion: 1 | 2 | 3;
	seedNumero: number;
};

export type BracketArmado = {
	// Cantidad real de parejas que entran al cuadro (= cantidad de clasificados).
	cantidadParejas: number;
	// Tamaño del cuadro (potencia de 2 >= cantidadParejas).
	cantidadParejasCuadro: number;
	// Cuantos byes hay (cuadro - parejas). Cero si N es potencia de 2.
	cantidadByes: number;
	// Partidos en orden temporal (primera ronda primero, luego siguientes).
	partidos: PartidoBracketPlantilla[];
};

export type FaseBracket = '32vos' | '16vos' | '8vos' | '4tos' | 'Semis' | 'Final';

export type PartidoBracketPlantilla = PartidoPlantilla & {
	ronda: number;
	posicionEnRonda: number;
	fase: FaseBracket;
};

// Construye la lista de clasificados a partir de zonas + clasifican.
// `zonas` debe venir ordenado por letra.
export function listarClasificados(
	zonas: { letra: string; clasifican: Clasifican }[]
): ClasificadoSeed[] {
	const seeds: ClasificadoSeed[] = [];
	for (let pos: 1 | 2 | 3 = 1; pos <= 3; pos = (pos + 1) as 1 | 2 | 3) {
		for (const z of zonas) {
			if (pos <= z.clasifican) {
				seeds.push({
					letraZona: z.letra,
					posicion: pos,
					seedNumero: seeds.length + 1
				});
			}
		}
		if (pos === 3) break;
	}
	return seeds;
}

// =============================================================================
// Helpers
// =============================================================================

function sembrarSnake(n: number): number[] {
	if (n === 1) return [1];
	let seeds = [1, 2];
	let actual = 2;
	while (actual < n) {
		const siguiente = actual * 2;
		const nuevo: number[] = [];
		for (const s of seeds) {
			nuevo.push(s);
			nuevo.push(siguiente + 1 - s);
		}
		seeds = nuevo;
		actual = siguiente;
	}
	return seeds;
}

function esPotenciaDe2(n: number): boolean {
	return n >= 2 && (n & (n - 1)) === 0;
}

function siguientePotenciaDe2(n: number): number {
	if (n <= 1) return 1;
	let p = 1;
	while (p < n) p *= 2;
	return p;
}

// Nombre de la fase segun cuantos partidos REALES + bye hay en la ronda
// (= cuantos slots del cuadro entran a esa ronda).
//
// - 64 slots → 32vos (primera ronda de cuadros muy grandes, no soportado en UI)
// - 32 slots → 16vos
// - 16 slots → 8vos (a.k.a. Octavos)
// - 8 slots  → 4tos (a.k.a. Cuartos)
// - 4 slots  → Semis
// - 2 slots  → Final
//
// El mapeo es importante: cuando hay byes, la 1ra ronda PARTIDOS REALES
// puede ser de 16vos aunque algunos pasen directo a 8vos.
function faseDeRonda(slotsEnRonda: number): FaseBracket {
	if (slotsEnRonda >= 64) return '32vos';
	if (slotsEnRonda === 32) return '16vos';
	if (slotsEnRonda === 16) return '8vos';
	if (slotsEnRonda === 8) return '4tos';
	if (slotsEnRonda === 4) return 'Semis';
	return 'Final';
}

// =============================================================================
// armarBracket
// =============================================================================

export function armarBracket(
	zonas: { letra: string; clasifican: Clasifican }[]
): BracketArmado {
	const seeds = listarClasificados(zonas);
	const N = seeds.length;
	if (N < 2) {
		throw new Error('Se necesitan al menos 2 clasificados para armar el bracket.');
	}

	// Cuadro = siguiente potencia de 2 >= N. byes = cuadro - N.
	const cuadro = siguientePotenciaDe2(N);
	const byes = cuadro - N;

	// Sembrado snake sobre `cuadro` slots. Los seeds 1..N son reales, los
	// seeds N+1..cuadro son "byes" (imaginarios).
	const ordenSnake = sembrarSnake(cuadro);

	const partidos: PartidoBracketPlantilla[] = [];
	let numeroGlobal = 0;

	// Cada slot del cuadro produce una ParejaRef que va a la siguiente ronda.
	// Si el slot esta emparejado con un bye, la ref es la PosicionZona directa.
	// Si juega un partido real, es GanadorPartido.
	const refsSegundaRonda: ParejaRef[] = [];

	for (let i = 0; i < cuadro; i += 2) {
		const seedA = ordenSnake[i];
		const seedB = ordenSnake[i + 1];
		if (seedA === undefined || seedB === undefined) continue;
		const sA = seedA <= N ? seeds[seedA - 1] : null;
		const sB = seedB <= N ? seeds[seedB - 1] : null;

		if (sA && sB) {
			// Partido real.
			numeroGlobal += 1;
			partidos.push({
				numeroEnZona: numeroGlobal,
				ronda: 1,
				posicionEnRonda: i / 2 + 1,
				fase: faseDeRonda(cuadro),
				pareja1Ref: { tipo: 'PosicionZona', letraZona: sA.letraZona, posicion: sA.posicion },
				pareja2Ref: { tipo: 'PosicionZona', letraZona: sB.letraZona, posicion: sB.posicion }
			});
			refsSegundaRonda.push({
				tipo: 'GanadorPartido',
				numeroEnZona: numeroGlobal
			});
		} else if (sA) {
			// Bye para sA → pasa directo a 2da ronda.
			refsSegundaRonda.push({
				tipo: 'PosicionZona',
				letraZona: sA.letraZona,
				posicion: sA.posicion
			});
		} else if (sB) {
			refsSegundaRonda.push({
				tipo: 'PosicionZona',
				letraZona: sB.letraZona,
				posicion: sB.posicion
			});
		}
		// (Ambos null es imposible si N >= cuadro/2 + 1, lo cual se cumple
		// porque cuadro es la siguiente potencia >= N, asi que cuadro <= 2N.)
	}

	// Rondas siguientes: cada ronda toma las refs entrantes de a pares y
	// genera un partido por par.
	let entrantes = refsSegundaRonda;
	let nroRonda = byes > 0 ? 2 : 2; // siempre empezamos en 2 (1ra ronda ya hecha)
	while (entrantes.length > 1) {
		const saliente: ParejaRef[] = [];
		const cantSlots = entrantes.length;
		for (let i = 0; i < entrantes.length; i += 2) {
			const a = entrantes[i];
			const b = entrantes[i + 1];
			if (!a || !b) continue;
			numeroGlobal += 1;
			partidos.push({
				numeroEnZona: numeroGlobal,
				ronda: nroRonda,
				posicionEnRonda: i / 2 + 1,
				fase: faseDeRonda(cantSlots),
				pareja1Ref: a,
				pareja2Ref: b
			});
			saliente.push({ tipo: 'GanadorPartido', numeroEnZona: numeroGlobal });
		}
		entrantes = saliente;
		nroRonda += 1;
	}

	return {
		cantidadParejas: N,
		cantidadParejasCuadro: cuadro,
		cantidadByes: byes,
		partidos
	};
}

export { sembrarSnake, esPotenciaDe2, siguientePotenciaDe2 };
