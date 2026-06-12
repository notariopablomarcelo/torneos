import {
	db,
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	orderBy,
	query,
	updateDoc,
	where,
	writeBatch
} from '$lib/db';
import {
	categoriaDoc,
	partidoDoc,
	partidosCol,
	zonaDoc,
	zonasCol
} from './firestore';
import {
	armarZonas as armarZonasAlgoritmo,
	generarPartidosDeZona,
	reconciliarPartidos
} from '$lib/zonas/algoritmo';
import { armarBracket } from '$lib/bracket/algoritmo';
import type {
	ArmadoConfig,
	BracketConfig,
	ModalidadZona4,
	Partido,
	ResultadoPartido,
	TamanoZona,
	Zona
} from '$lib/types/armado';
import type { Inscripcion } from '$lib/types/inscripcion';

// Ordena las inscripciones para el armado: las con ranking primero
// (ascendente), las sin ranking al final por orden de creacion. Esta es la
// politica explicita acordada — las sin ranking caen al final del snake.
export function ordenarInscripcionesParaArmado(
	inscripciones: Inscripcion[]
): Inscripcion[] {
	return [...inscripciones].sort((a, b) => {
		if (a.ranking === null && b.ranking === null) {
			return a.creadoEn.localeCompare(b.creadoEn);
		}
		if (a.ranking === null) return 1;
		if (b.ranking === null) return -1;
		return a.ranking - b.ranking;
	});
}

// Arma (o re-arma) las zonas de una categoria. Borra todas las zonas y
// partidos existentes y los recrea con el algoritmo + config indicados.
// Todo se hace en un solo writeBatch atomico. Actualiza categoria.armadoConfig.
//
// Para v1 esto es destructivo total: pierde resultados de partidos jugados.
// Cuando soportemos modificacion individual de una zona, ahi se aplica la
// reconciliacion partido-por-partido (algoritmo.ts ya tiene reconciliarPartidos).
export async function armarZonasCategoria(
	torneoId: string,
	categoriaId: string,
	inscripciones: Inscripcion[],
	config: Omit<ArmadoConfig, 'armadoEn'>
): Promise<void> {
	// Validacion antes del I/O para fallar rapido y no gastar round-trips.
	if (inscripciones.length < 3) {
		throw new Error('Se necesitan al menos 3 inscripciones para armar zonas');
	}

	const ordenadas = ordenarInscripcionesParaArmado(inscripciones);
	const ids = ordenadas.map((i) => i.id);

	// Si vino estructura personalizada en `config.grupos`, la usamos para
	// derivar la lista exacta de tamanos por zona. Sino, modo simple:
	// el algoritmo deriva la distribucion desde `tamanoPreferido`.
	//
	// `modalidadPorZonaIdx` y `clasificanPorZonaIdx` mapean cada zona
	// armada (por indice en el orden A, B, C...) a su modalidad/clasifican
	// segun el grupo al que pertenece. Si no hay grupos, todos quedan con
	// los defaults del `config`.
	const usaGrupos = config.grupos && config.grupos.length > 0;
	const tamanosPorZona: TamanoZona[] = [];
	const modalidadPorZonaIdx: (ModalidadZona4 | 'todosContraTodos')[] = [];
	const clasificanPorZonaIdx: (1 | 2 | 3)[] = [];

	if (usaGrupos) {
		for (const g of config.grupos!) {
			for (let i = 0; i < g.cantidad; i += 1) {
				tamanosPorZona.push(g.tamano);
				modalidadPorZonaIdx.push(
					g.tamano === 4
						? (g.modalidad ?? 'todosContraTodos')
						: 'todosContraTodos'
				);
				clasificanPorZonaIdx.push(
					Math.min(g.clasifican, g.tamano - 1) as 1 | 2 | 3
				);
			}
		}
	}

	// armarZonasAlgoritmo acepta TamanoZona o TamanoZona[]. Si pasamos la
	// lista usa los grupos custom; sino deriva la distribucion automatica
	// con tamanoPreferido (modo simple).
	const zonasArmadas = armarZonasAlgoritmo(
		ids,
		config.algoritmo,
		usaGrupos ? tamanosPorZona : config.tamanoPreferido
	);

	// NOTA sobre race condition: si esta funcion se llama dos veces en
	// paralelo (doble submit, dos pestanas, dos dispositivos) los deletes
	// pueden no ver los creates del otro y quedan zonas/partidos
	// duplicados. v1 mitiga con el guard `guardando` del form. Para v2
	// conviene un token de generacion o lock con TTL en la categoria.

	// Traer todo lo existente para borrarlo en el mismo batch.
	const [zonasViejas, partidosViejos] = await Promise.all([
		getDocs(zonasCol(torneoId, categoriaId)),
		getDocs(partidosCol(torneoId, categoriaId))
	]);

	const batch = writeBatch(db());

	// Borrar lo viejo.
	for (const d of zonasViejas.docs) batch.delete(d.ref);
	for (const d of partidosViejos.docs) batch.delete(d.ref);

	const ahora = new Date().toISOString();

	// Crear lo nuevo.
	for (let zIdx = 0; zIdx < zonasArmadas.length; zIdx += 1) {
		const z = zonasArmadas[zIdx]!;
		// Si vino estructura custom, modalidad y clasifican vienen del
		// grupo al que pertenece esta zona (mapa por indice). Si es modo
		// simple, los toma del config plano.
		const modalidad: ModalidadZona4 | 'todosContraTodos' = usaGrupos
			? modalidadPorZonaIdx[zIdx]!
			: z.tamano === 4
				? config.modalidadZona4
				: 'todosContraTodos';
		const partidosPlantilla = generarPartidosDeZona(
			z,
			modalidad === 'todosContraTodos' ? 'todosContraTodos' : 'dobleOportunidad'
		);

		const clasificanMax = z.tamano - 1;
		const clasificanZona = usaGrupos
			? clasificanPorZonaIdx[zIdx]!
			: (Math.min(config.clasificanPorZona, clasificanMax) as 1 | 2 | 3);

		const zonaRef = doc(zonasCol(torneoId, categoriaId));
		batch.set(zonaRef, {
			categoriaId,
			letra: z.letra,
			tamano: z.tamano,
			modalidad,
			clasifican: clasificanZona,
			inscripcionIds: z.inscripcionIds,
			creadoEn: ahora
		});

		for (const p of partidosPlantilla) {
			const partidoRef = doc(partidosCol(torneoId, categoriaId));
			batch.set(partidoRef, {
				categoriaId,
				zonaId: zonaRef.id,
				fase: 'Zona',
				numeroEnZona: p.numeroEnZona,
				pareja1Ref: p.pareja1Ref,
				pareja2Ref: p.pareja2Ref,
				resultado: null,
				estado: 'Pendiente',
				creadoEn: ahora
			});
		}
	}

	// Auto-armar el bracket en el mismo batch. Cada zona aporta su letra
	// + clasifican (segun el grupo al que pertenece, o el default simple).
	const zonasParaBracket = zonasArmadas.map((z, zIdx) => ({
		letra: z.letra,
		clasifican: usaGrupos
			? clasificanPorZonaIdx[zIdx]!
			: (Math.min(config.clasificanPorZona, z.tamano - 1) as 1 | 2 | 3)
	}));
	const bracketArmado = armarBracket(zonasParaBracket);
	const bracketId = doc(partidosCol(torneoId, categoriaId)).id;
	for (const plantilla of bracketArmado.partidos) {
		const docRef = doc(partidosCol(torneoId, categoriaId));
		batch.set(docRef, {
			categoriaId,
			zonaId: null,
			bracketId,
			fase: plantilla.fase,
			numeroEnZona: plantilla.numeroEnZona,
			ronda: plantilla.ronda,
			posicionEnRonda: plantilla.posicionEnRonda,
			pareja1Ref: plantilla.pareja1Ref,
			pareja2Ref: plantilla.pareja2Ref,
			resultado: null,
			estado: 'Pendiente',
			creadoEn: ahora
		} satisfies Omit<Partido, 'id'>);
	}

	// Persistir la config en la categoria. Asi sabemos que esta armada y con
	// que parametros.
	const armadoConfig: ArmadoConfig = { ...config, armadoEn: ahora };
	const bracketConfig: BracketConfig = {
		cantidadParejas: bracketArmado.cantidadParejas,
		armadoEn: ahora
	};
	batch.update(categoriaDoc(torneoId, categoriaId), {
		armadoConfig,
		bracketConfig
	});

	await batch.commit();
}

// Vuelve la categoria a "no armada": borra zonas, partidos y resetea
// armadoConfig a null. Util si se quiere "desarmar" sin volver a armar
// (por ejemplo, si se equivocaron de config y quieren empezar de cero
// antes de jugar nada).
export async function desarmarZonasCategoria(
	torneoId: string,
	categoriaId: string
): Promise<void> {
	const [zonasViejas, partidosViejos] = await Promise.all([
		getDocs(zonasCol(torneoId, categoriaId)),
		getDocs(partidosCol(torneoId, categoriaId))
	]);
	const batch = writeBatch(db());
	for (const d of zonasViejas.docs) batch.delete(d.ref);
	for (const d of partidosViejos.docs) batch.delete(d.ref);
	batch.update(categoriaDoc(torneoId, categoriaId), { armadoConfig: null });
	await batch.commit();
}

// Agrega una inscripcion a una zona ya armada. Solo aplica a zonas con tamano 3
// (pasan a 4). Reordena la composicion por ranking, genera los partidos nuevos
// y reconcilia con los viejos: preserva los pares que siguen existiendo (con
// sus resultados), elimina los que ya no aplican y crea los nuevos.
//
// Si la zona pasa de 3 a 4, se usa la modalidad pasada como parametro (la del
// armadoConfig de la categoria) para los nuevos partidos.
export async function agregarInscripcionAZona(
	torneoId: string,
	categoriaId: string,
	zonaId: string,
	inscripcionIdNueva: string,
	inscripcionesDeLaCategoria: Inscripcion[],
	modalidadZona4: ModalidadZona4
): Promise<{ partidosCreados: number; partidosEliminados: number; partidosPreservados: number }> {
	const zonaSnap = await getDoc(zonaDoc(torneoId, categoriaId, zonaId));
	if (!zonaSnap.exists()) throw new Error('La zona no existe');
	const zonaActual: Zona = { id: zonaSnap.id, ...zonaSnap.data() };

	if (zonaActual.tamano >= 4 || zonaActual.inscripcionIds.length >= 4) {
		throw new Error('La zona ya está llena (4 parejas). Re-armá la categoría para redistribuir.');
	}

	if (zonaActual.inscripcionIds.includes(inscripcionIdNueva)) {
		throw new Error('Esa pareja ya está en la zona');
	}

	// Nueva composicion = viejas + la nueva, reordenada por ranking.
	const idsObjetivo = new Set([...zonaActual.inscripcionIds, inscripcionIdNueva]);
	const incsDeLaZona = inscripcionesDeLaCategoria.filter((i) => idsObjetivo.has(i.id));
	if (incsDeLaZona.length !== idsObjetivo.size) {
		throw new Error('No se encontraron todas las inscripciones de la zona');
	}
	const ordenadas = ordenarInscripcionesParaArmado(incsDeLaZona);
	const nuevosIds = ordenadas.map((i) => i.id);
	const nuevoTamano: TamanoZona = nuevosIds.length as TamanoZona;
	const nuevaModalidad: ModalidadZona4 | 'todosContraTodos' =
		nuevoTamano === 4 ? modalidadZona4 : 'todosContraTodos';

	// Generamos los partidos planeados para la nueva composicion.
	const partidosPlantilla = generarPartidosDeZona(
		{ letra: zonaActual.letra, tamano: nuevoTamano, inscripcionIds: nuevosIds },
		nuevaModalidad === 'dobleOportunidad' ? 'dobleOportunidad' : 'todosContraTodos'
	);

	// Traemos partidos viejos de ESTA zona para reconciliar.
	const partidosViejosSnap = await getDocs(
		query(partidosCol(torneoId, categoriaId), where('zonaId', '==', zonaId))
	);
	const partidosViejos: Partido[] = partidosViejosSnap.docs.map((d) => ({
		id: d.id,
		...d.data()
	}));

	const recon = reconciliarPartidos(partidosViejos, partidosPlantilla);

	const batch = writeBatch(db());

	// Update de la zona.
	batch.update(zonaDoc(torneoId, categoriaId, zonaId), {
		tamano: nuevoTamano,
		modalidad: nuevaModalidad,
		inscripcionIds: nuevosIds
	});

	// Partidos preservados: pueden tener distinto numeroEnZona en la nueva
	// config (cambia el orden de generacion). Sincronizamos solo eso.
	for (const { viejo, nuevo } of recon.aPreservar) {
		if (viejo.numeroEnZona !== nuevo.numeroEnZona) {
			batch.update(partidoDoc(torneoId, categoriaId, viejo.id), {
				numeroEnZona: nuevo.numeroEnZona
			});
		}
	}

	// Eliminar viejos que ya no encajan.
	for (const p of recon.aEliminar) {
		batch.delete(partidoDoc(torneoId, categoriaId, p.id));
	}

	// Crear nuevos.
	const ahora = new Date().toISOString();
	for (const p of recon.aCrear) {
		const partidoRef = doc(partidosCol(torneoId, categoriaId));
		batch.set(partidoRef, {
			categoriaId,
			zonaId,
			fase: 'Zona',
			numeroEnZona: p.numeroEnZona,
			pareja1Ref: p.pareja1Ref,
			pareja2Ref: p.pareja2Ref,
			resultado: null,
			estado: 'Pendiente',
			creadoEn: ahora
		});
	}

	await batch.commit();

	return {
		partidosCreados: recon.aCrear.length,
		partidosEliminados: recon.aEliminar.length,
		partidosPreservados: recon.aPreservar.length
	};
}

// Cambia cuantas parejas clasifican en una zona. No toca partidos (el campo
// se usa al armar el bracket, mas adelante). Valida que el valor sea
// compatible con el tamano de la zona.
export async function cambiarClasificanZona(
	torneoId: string,
	categoriaId: string,
	zonaId: string,
	nuevoClasifican: 1 | 2 | 3
): Promise<void> {
	const zonaSnap = await getDoc(zonaDoc(torneoId, categoriaId, zonaId));
	if (!zonaSnap.exists()) throw new Error('La zona no existe');
	const zonaActual: Zona = { id: zonaSnap.id, ...zonaSnap.data() };

	const max = zonaActual.tamano - 1;
	if (nuevoClasifican > max) {
		throw new Error(
			`En una zona de ${zonaActual.tamano} no pueden clasificar más de ${max}`
		);
	}
	if (nuevoClasifican < 1) {
		throw new Error('Tiene que clasificar al menos 1');
	}

	const batch = writeBatch(db());
	batch.update(zonaDoc(torneoId, categoriaId, zonaId), { clasifican: nuevoClasifican });
	await batch.commit();
}

// Cambia la modalidad de una zona de 4 parejas (RR <-> DO) sin tocar la
// composicion. Genera los partidos nuevos y reconcilia con los viejos para
// preservar los pares que siguen existiendo en la nueva modalidad.
export async function cambiarModalidadZona(
	torneoId: string,
	categoriaId: string,
	zonaId: string,
	nuevaModalidad: ModalidadZona4
): Promise<{ partidosCreados: number; partidosEliminados: number; partidosPreservados: number }> {
	const zonaSnap = await getDoc(zonaDoc(torneoId, categoriaId, zonaId));
	if (!zonaSnap.exists()) throw new Error('La zona no existe');
	const zonaActual: Zona = { id: zonaSnap.id, ...zonaSnap.data() };

	if (zonaActual.tamano !== 4) {
		throw new Error('La modalidad solo aplica a zonas de 4 parejas');
	}

	if (zonaActual.modalidad === nuevaModalidad) {
		return { partidosCreados: 0, partidosEliminados: 0, partidosPreservados: 0 };
	}

	const partidosPlantilla = generarPartidosDeZona(
		{
			letra: zonaActual.letra,
			tamano: 4,
			inscripcionIds: zonaActual.inscripcionIds
		},
		nuevaModalidad
	);

	const partidosViejosSnap = await getDocs(
		query(partidosCol(torneoId, categoriaId), where('zonaId', '==', zonaId))
	);
	const partidosViejos: Partido[] = partidosViejosSnap.docs.map((d) => ({
		id: d.id,
		...d.data()
	}));

	const recon = reconciliarPartidos(partidosViejos, partidosPlantilla);

	const batch = writeBatch(db());

	batch.update(zonaDoc(torneoId, categoriaId, zonaId), {
		modalidad: nuevaModalidad
	});

	for (const { viejo, nuevo } of recon.aPreservar) {
		if (viejo.numeroEnZona !== nuevo.numeroEnZona) {
			batch.update(partidoDoc(torneoId, categoriaId, viejo.id), {
				numeroEnZona: nuevo.numeroEnZona
			});
		}
	}

	for (const p of recon.aEliminar) {
		batch.delete(partidoDoc(torneoId, categoriaId, p.id));
	}

	const ahora = new Date().toISOString();
	for (const p of recon.aCrear) {
		const partidoRef = doc(partidosCol(torneoId, categoriaId));
		batch.set(partidoRef, {
			categoriaId,
			zonaId,
			fase: 'Zona',
			numeroEnZona: p.numeroEnZona,
			pareja1Ref: p.pareja1Ref,
			pareja2Ref: p.pareja2Ref,
			resultado: null,
			estado: 'Pendiente',
			creadoEn: ahora
		});
	}

	await batch.commit();

	return {
		partidosCreados: recon.aCrear.length,
		partidosEliminados: recon.aEliminar.length,
		partidosPreservados: recon.aPreservar.length
	};
}

// Carga el resultado de un partido. Marca el partido como Jugado y actualiza
// los campos resultado/estado. No hace validaciones de coherencia (sets vs
// ganadorEs); el form se encarga de eso. La resolucion de refs simbolicas
// (partidos siguientes en DO) es derivada en el cliente: el helper
// resolverParejaRef hace la cuenta cuando se renderiza.
export async function cargarResultadoPartido(
	torneoId: string,
	categoriaId: string,
	partidoId: string,
	resultado: ResultadoPartido
): Promise<void> {
	await updateDoc(partidoDoc(torneoId, categoriaId, partidoId), {
		resultado,
		estado: 'Jugado'
	});
}

// Borra el resultado de un partido y lo vuelve a Pendiente. Util para
// corregir errores de carga.
export async function borrarResultadoPartido(
	torneoId: string,
	categoriaId: string,
	partidoId: string
): Promise<void> {
	await updateDoc(partidoDoc(torneoId, categoriaId, partidoId), {
		resultado: null,
		estado: 'Pendiente'
	});
}

// Suscripcion al listado de zonas de una categoria, ordenadas por letra.
export function suscribirZonas(
	torneoId: string,
	categoriaId: string,
	cb: (zonas: Zona[]) => void
): () => void {
	const q = query(zonasCol(torneoId, categoriaId), orderBy('letra', 'asc'));
	return onSnapshot(q, (snap) => {
		cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
	});
}

// Suscripcion al listado de partidos de una categoria. Sin orderBy porque
// los partidos son agrupables por zona en cliente.
export function suscribirPartidos(
	torneoId: string,
	categoriaId: string,
	cb: (partidos: Partido[]) => void
): () => void {
	return onSnapshot(partidosCol(torneoId, categoriaId), (snap) => {
		cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
	});
}
