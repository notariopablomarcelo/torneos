import {
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	orderBy,
	query,
	where,
	writeBatch
} from 'firebase/firestore';
import { db } from '$lib/firebase';
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
import type {
	ArmadoConfig,
	ModalidadZona4,
	Partido,
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

	// Llamamos armarZonas primero: si la combinacion (N, preferencia) es
	// invalida, lanza aca antes de tocar Firestore.
	const zonasArmadas = armarZonasAlgoritmo(
		ids,
		config.algoritmo,
		config.tamanoPreferido
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
	for (const z of zonasArmadas) {
		const modalidad: ModalidadZona4 | 'todosContraTodos' =
			z.tamano === 4 ? config.modalidadZona4 : 'todosContraTodos';
		// Pasamos la modalidad ya resuelta (no la config cruda) para que el
		// algoritmo no tenga que filtrar implicitamente "zona de 3 ignora DO".
		const partidosPlantilla = generarPartidosDeZona(
			z,
			modalidad === 'todosContraTodos' ? 'todosContraTodos' : 'dobleOportunidad'
		);

		// Cap clasifican por tamano: en zona de 3, max 2; en zona de 4, max 3.
		// Si la config macro pidio 3 pero la zona es de 3, capeamos a 2.
		const clasificanMax = z.tamano - 1;
		const clasificanZona = Math.min(config.clasificanPorZona, clasificanMax) as 1 | 2 | 3;

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

	// Persistir la config en la categoria. Asi sabemos que esta armada y con
	// que parametros.
	const armadoConfig: ArmadoConfig = { ...config, armadoEn: ahora };
	batch.update(categoriaDoc(torneoId, categoriaId), {
		armadoConfig
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
