import type {
	Algoritmo,
	ModalidadZona4,
	ParejaRef,
	Partido,
	PartidoPlantilla,
	TamanoZona,
	ZonaArmada
} from '$lib/types/armado';

// ===========================================================================
// Distribucion de zonas
// ===========================================================================

// Dada N inscripciones y un tamano preferido, calcula cuantas zonas de 3 y
// cuantas de 4 hacer. Reglas:
//
// Preferencia 3 (FAP estandar):
//   N % 3 == 0  -> todas de 3.
//   N % 3 == 1  -> una zona de 4, el resto de 3.
//   N % 3 == 2  -> dos zonas de 4, el resto de 3.
//
// Preferencia 4 (cuando es posible):
//   N % 4 == 0  -> todas de 4.
//   N % 4 == 3  -> una zona de 3, el resto de 4.
//   N % 4 == 2  -> dos zonas de 3, el resto de 4.
//   N % 4 == 1  -> tres zonas de 3, el resto de 4. (4 + 3*3 = 13, etc.)
//                  Si no alcanza para resto de 4, caemos a preferencia 3.
//
// En todos los casos N >= 3 (validado por el caller).
export function calcularDistribucion(
	N: number,
	preferencia: TamanoZona
): { zonas3: number; zonas4: number } {
	if (N < 3) {
		throw new Error(`Se necesitan al menos 3 inscripciones para armar zonas (N=${N})`);
	}

	if (preferencia === 3) {
		const resto = N % 3;
		if (resto === 0) return { zonas3: N / 3, zonas4: 0 };
		if (resto === 1) {
			if (N < 4) throw new Error(`N=${N} es muy chico para una distribucion con preferencia 3`);
			return { zonas3: (N - 4) / 3, zonas4: 1 };
		}
		// resto === 2. Minimo viable: N=8 (2 zonas de 4). Para N=5 no hay
		// distribucion limpia (1 zona de 5 no es estandar).
		if (N < 8) {
			throw new Error(
				`N=${N} no tiene distribucion valida con preferencia 3 (necesitas ${8 - N} inscripciones mas, o sacar ${N - 3} para tener 1 zona de 3)`
			);
		}
		return { zonas3: (N - 8) / 3, zonas4: 2 };
	}

	// preferencia === 4
	const resto = N % 4;
	if (resto === 0) return { zonas3: 0, zonas4: N / 4 };
	if (resto === 3) return { zonas3: 1, zonas4: (N - 3) / 4 };
	if (resto === 2) return { zonas3: 2, zonas4: (N - 6) / 4 };
	// resto === 1: 3 zonas de 3 cubren 9, falta N-9 para zonas de 4.
	// Si N < 13 no hay zonas de 4 suficientes (caso N=5: 4+? no funciona;
	// caso N=9: tres zonas de 3, cero de 4). Caemos al esquema FAP.
	if (N >= 13) {
		return { zonas3: 3, zonas4: (N - 9) / 4 };
	}
	// Fallback (N=5, 9): no se puede preferir 4 limpiamente -> usar preferencia 3.
	return calcularDistribucion(N, 3);
}

// ===========================================================================
// Armado de zonas
// ===========================================================================

// Letras de zona en orden alfabetico: A, B, ..., Z. Mas que suficiente para
// torneos reales (max ~24-32 zonas en torneos grandes).
function letraZona(indice: number): string {
	return String.fromCharCode(65 + indice);
}

// Snake draft: zonas de 4 primero (A, B, ...), zonas de 3 despues, luego
// llenamos por "filas" alternando direccion. Las inscripciones vienen ya
// ordenadas por ranking (1 = mejor); cuando no tienen ranking van al final.
export function armarZonasSnake(
	inscripcionIdsOrdenados: string[],
	distribucion: { zonas3: number; zonas4: number }
): ZonaArmada[] {
	const { zonas3, zonas4 } = distribucion;
	const totalZonas = zonas3 + zonas4;

	// Inicializamos las zonas: las de 4 al principio (A, B, ...), luego las
	// de 3. inscripcionIds vacios; se llenan abajo.
	const zonas: ZonaArmada[] = [];
	for (let i = 0; i < totalZonas; i++) {
		zonas.push({
			letra: letraZona(i),
			tamano: i < zonas4 ? 4 : 3,
			inscripcionIds: []
		});
	}

	const maxFilas = zonas4 > 0 ? 4 : 3;
	let idx = 0;

	for (let fila = 0; fila < maxFilas; fila++) {
		// Direccion: par -> izquierda a derecha; impar -> derecha a izquierda.
		// Eso es lo que hace "snake".
		const ascendente = fila % 2 === 0;
		const inicio = ascendente ? 0 : totalZonas - 1;
		const paso = ascendente ? 1 : -1;
		const fin = ascendente ? totalZonas : -1;

		for (let z = inicio; z !== fin; z += paso) {
			if (fila < zonas[z].tamano && idx < inscripcionIdsOrdenados.length) {
				zonas[z].inscripcionIds.push(inscripcionIdsOrdenados[idx]);
				idx++;
			}
		}
	}

	return zonas;
}

// Random: respeta los tamanos pero no usa ranking. Util para torneos
// amistosos donde no importa balancear. Acepta una funcion random custom
// para que los tests sean deterministas.
export function armarZonasRandom(
	inscripcionIds: string[],
	distribucion: { zonas3: number; zonas4: number },
	random: () => number = Math.random
): ZonaArmada[] {
	const { zonas3, zonas4 } = distribucion;
	const totalZonas = zonas3 + zonas4;

	// Fisher-Yates shuffle con random inyectable.
	const mezclados = [...inscripcionIds];
	for (let i = mezclados.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[mezclados[i], mezclados[j]] = [mezclados[j], mezclados[i]];
	}

	const zonas: ZonaArmada[] = [];
	let idx = 0;
	for (let i = 0; i < totalZonas; i++) {
		const tamano: TamanoZona = i < zonas4 ? 4 : 3;
		zonas.push({
			letra: letraZona(i),
			tamano,
			inscripcionIds: mezclados.slice(idx, idx + tamano)
		});
		idx += tamano;
	}
	return zonas;
}

// Facade que elige el algoritmo segun la config.
export function armarZonas(
	inscripcionIdsOrdenados: string[],
	algoritmo: Algoritmo,
	tamanoPreferido: TamanoZona,
	random?: () => number
): ZonaArmada[] {
	const dist = calcularDistribucion(inscripcionIdsOrdenados.length, tamanoPreferido);
	if (algoritmo === 'snake') return armarZonasSnake(inscripcionIdsOrdenados, dist);
	return armarZonasRandom(inscripcionIdsOrdenados, dist, random);
}

// ===========================================================================
// Generacion de partidos
// ===========================================================================

// Round-robin (todos contra todos) para N inscripciones. Genera N*(N-1)/2
// partidos. Para zona de 3: 3 partidos. Para zona de 4: 6 partidos.
export function generarRoundRobin(inscripcionIds: string[]): PartidoPlantilla[] {
	const partidos: PartidoPlantilla[] = [];
	let numero = 1;
	for (let i = 0; i < inscripcionIds.length; i++) {
		for (let j = i + 1; j < inscripcionIds.length; j++) {
			partidos.push({
				numeroEnZona: numero++,
				pareja1Ref: { tipo: 'Inscripcion', inscripcionId: inscripcionIds[i] as string },
				pareja2Ref: { tipo: 'Inscripcion', inscripcionId: inscripcionIds[j] as string }
			});
		}
	}
	return partidos;
}

// Doble oportunidad para zonas de 4. Cruces iniciales 1v4 y 2v3; despues los
// dos ganadores juegan entre si (clasifica el ganador como 1°) y los dos
// perdedores juegan entre si (define quien queda 3° y quien 4°). Total: 4
// partidos.
export function generarDobleOportunidad(inscripcionIds: string[]): PartidoPlantilla[] {
	if (inscripcionIds.length !== 4) {
		throw new Error(
			`Doble oportunidad requiere exactamente 4 inscripciones (recibi ${inscripcionIds.length})`
		);
	}
	const [p1, p2, p3, p4] = inscripcionIds as [string, string, string, string];
	return [
		{
			numeroEnZona: 1,
			pareja1Ref: { tipo: 'Inscripcion', inscripcionId: p1 },
			pareja2Ref: { tipo: 'Inscripcion', inscripcionId: p4 }
		},
		{
			numeroEnZona: 2,
			pareja1Ref: { tipo: 'Inscripcion', inscripcionId: p2 },
			pareja2Ref: { tipo: 'Inscripcion', inscripcionId: p3 }
		},
		{
			numeroEnZona: 3,
			pareja1Ref: { tipo: 'GanadorPartido', numeroEnZona: 1 },
			pareja2Ref: { tipo: 'GanadorPartido', numeroEnZona: 2 }
		},
		{
			numeroEnZona: 4,
			pareja1Ref: { tipo: 'PerdedorPartido', numeroEnZona: 1 },
			pareja2Ref: { tipo: 'PerdedorPartido', numeroEnZona: 2 }
		}
	];
}

// Facade que elige el formato segun la zona.
export function generarPartidosDeZona(
	zona: ZonaArmada,
	modalidad: ModalidadZona4
): PartidoPlantilla[] {
	if (zona.tamano === 3) {
		// Zonas de 3 son round-robin si o si.
		return generarRoundRobin(zona.inscripcionIds);
	}
	if (modalidad === 'todosContraTodos') {
		return generarRoundRobin(zona.inscripcionIds);
	}
	return generarDobleOportunidad(zona.inscripcionIds);
}

// ===========================================================================
// Reconciliacion de partidos al re-armar
// ===========================================================================

// Dada la lista de partidos viejos (con sus resultados) y la nueva lista de
// partidos planeados, decide cuales preservar (mismas dos inscripciones,
// resultado se mantiene), cuales crear (no existian antes) y cuales eliminar
// (existian pero ya no tienen lugar). Solo se reconcilian partidos cuyos
// refs son ambos directos (tipo Inscripcion); los simbolicos (Ganador/
// Perdedor) se regeneran siempre porque dependen de partidos previos.
export function reconciliarPartidos(
	viejos: Partido[],
	nuevos: PartidoPlantilla[]
): {
	aPreservar: { viejo: Partido; nuevo: PartidoPlantilla }[];
	aCrear: PartidoPlantilla[];
	aEliminar: Partido[];
} {
	const aPreservar: { viejo: Partido; nuevo: PartidoPlantilla }[] = [];
	const aCrear: PartidoPlantilla[] = [];
	const usadosViejos = new Set<string>();

	for (const nuevo of nuevos) {
		const setNuevo = setDeIds(nuevo);
		if (setNuevo === null) {
			// No es un partido con refs directos => no reconciliable, se crea.
			aCrear.push(nuevo);
			continue;
		}
		const match = viejos.find((v) => {
			if (usadosViejos.has(v.id)) return false;
			const setViejo = setDeIds(v);
			return setViejo !== null && setViejo === setNuevo;
		});
		if (match) {
			aPreservar.push({ viejo: match, nuevo });
			usadosViejos.add(match.id);
		} else {
			aCrear.push(nuevo);
		}
	}

	const aEliminar = viejos.filter((v) => !usadosViejos.has(v.id));
	return { aPreservar, aCrear, aEliminar };
}

// Devuelve una clave estable que representa el "par de inscripciones" del
// partido (sin importar el orden), o null si alguna ref no es directa.
// Tipado con el union real ParejaRef para mantener exhaustividad.
function setDeIds(p: { pareja1Ref: ParejaRef; pareja2Ref: ParejaRef }): string | null {
	if (p.pareja1Ref.tipo !== 'Inscripcion' || p.pareja2Ref.tipo !== 'Inscripcion') {
		return null;
	}
	return [p.pareja1Ref.inscripcionId, p.pareja2Ref.inscripcionId].sort().join('|');
}
