import {
	db,
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	query,
	updateDoc,
	where,
	writeBatch
} from '$lib/db';
import { categoriaDoc, partidoDoc, partidosCol } from './firestore';
import {
	armarBracket as armarBracketAlgoritmo,
	armarBracketDesdeSlots
} from '$lib/bracket/algoritmo';
import type {
	BracketConfig,
	ParejaRef,
	Partido,
	Zona
} from '$lib/types/armado';
import { calcularTablaPosiciones, estadoZona } from '$lib/zonas/resultados';

// Resuelve una ParejaRef del bracket a un inscripcionId concreto. Maneja:
// - Inscripcion directa.
// - GanadorPartido / PerdedorPartido (recursivo via partidos).
// - PosicionZona (solo si la zona esta finalizada — sino devuelve null).
//
// Devuelve null si todavia no se puede resolver. Util para UI: cuando se
// arma el bracket antes que las zonas terminen, las refs muestran el texto
// "1° de Zona A"; cuando la zona finaliza, automaticamente se transforma
// en el nombre de la pareja real.
export function resolverParejaRefBracket(
	ref: ParejaRef,
	partidos: Partido[],
	zonas: Zona[],
	zonaIdContexto: string | null = null
): string | null {
	if (ref.tipo === 'Inscripcion') return ref.inscripcionId;
	if (ref.tipo === 'PosicionZona') {
		const zona = zonas.find((z) => z.letra === ref.letraZona);
		if (!zona) return null;
		// Solo resolvemos si la zona termino para no exponer estados parciales
		// donde la "tabla de posiciones" todavia puede cambiar.
		const partidosZona = partidos.filter((p) => p.zonaId === zona.id);
		if (estadoZona(zona, partidosZona) !== 'Finalizada') return null;
		const tabla = calcularTablaPosiciones(zona, partidosZona);
		const fila = tabla[ref.posicion - 1];
		return fila?.inscripcionId ?? null;
	}
	// GanadorPartido / PerdedorPartido: buscar el partido padre EN EL MISMO
	// CONTEXTO que el ref. Si la ref viene de un partido de zona DO (P3/P4
	// → Ganador/Perdedor del P1/P2 de esa misma zona), `zonaIdContexto` es
	// el id de esa zona. Si viene del bracket, `zonaIdContexto` es null.
	// Sin este filtro por contexto, partidos con mismo numeroEnZona en
	// distintas zonas / bracket se confundian.
	const partidosCtx = partidos.filter(
		(p) => p.zonaId === zonaIdContexto
	);
	const partidoRef = partidosCtx.find(
		(p) => p.numeroEnZona === ref.numeroEnZona
	);
	if (!partidoRef || !partidoRef.resultado) return null;
	const refGanadora =
		partidoRef.resultado.ganadorEs === 1
			? partidoRef.pareja1Ref
			: partidoRef.pareja2Ref;
	const refPerdedora =
		partidoRef.resultado.ganadorEs === 1
			? partidoRef.pareja2Ref
			: partidoRef.pareja1Ref;
	// La recursion propaga el contexto del partido padre — al cruzar de
	// bracket a zona via PosicionZona el contexto cambia naturalmente; al
	// estar dentro de una zona DO el padre vive en la misma zona.
	if (ref.tipo === 'GanadorPartido') {
		return resolverParejaRefBracket(
			refGanadora,
			partidos,
			zonas,
			partidoRef.zonaId
		);
	}
	return resolverParejaRefBracket(
		refPerdedora,
		partidos,
		zonas,
		partidoRef.zonaId
	);
}

// Construye el bracket en Firestore. Recibe las zonas finalizadas (con su
// clasifican propio). Genera todos los partidos del bracket en un writeBatch
// atomico y actualiza categoria.bracketConfig.
//
// Pre-condicion: cada zona debe estar finalizada (todos sus partidos
// jugados). El caller valida; este servicio no.
//
// Si ya existe un bracket previo, lo BORRA y vuelve a generar (re-armado
// destructivo). En version futura podriamos reconciliar.
export async function armarBracketCategoria(
	torneoId: string,
	categoriaId: string,
	zonas: Zona[],
	slotsOverride?: (ParejaRef | null)[] | null
): Promise<void> {
	if (zonas.length === 0) {
		throw new Error('No hay zonas para clasificar al bracket.');
	}
	const zonasOrdenadas = [...zonas].sort((a, b) => a.letra.localeCompare(b.letra));

	// Si no se paso override explicito, leer el persistido en la categoria
	// (puede haberse guardado desde el preview antes de armar el bracket).
	let overrideEfectivo = slotsOverride;
	if (overrideEfectivo === undefined) {
		const catSnap = await getDoc(categoriaDoc(torneoId, categoriaId));
		const cat = catSnap.data() as { bracketSlotsOverride?: (ParejaRef | null)[] | null } | undefined;
		overrideEfectivo = cat?.bracketSlotsOverride ?? null;
	}

	// Si hay override valido (length potencia de 2, al menos 2 refs no-null),
	// usar `armarBracketDesdeSlots` (el organizador edito cruces). Sino,
	// sembrado snake default.
	const armado = overrideEfectivo && overrideEfectivo.length > 0
		? armarBracketDesdeSlots(overrideEfectivo)
		: armarBracketAlgoritmo(
				zonasOrdenadas.map((z) => ({ letra: z.letra, clasifican: z.clasifican }))
			);

	const partidosViejos = await getDocs(
		query(partidosCol(torneoId, categoriaId), where('zonaId', '==', null))
	);

	const batch = writeBatch(db());

	for (const snap of partidosViejos.docs) {
		batch.delete(snap.ref);
	}

	const bracketId = doc(partidosCol(torneoId, categoriaId)).id; // ID random reutilizable.
	const now = new Date().toISOString();

	for (const plantilla of armado.partidos) {
		const docRef = doc(partidosCol(torneoId, categoriaId));
		const partido: Omit<Partido, 'id'> = {
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
			creadoEn: now
		};
		batch.set(docRef, partido);
	}

	const config: BracketConfig = {
		cantidadParejas: armado.cantidadParejas,
		armadoEn: now,
		slotsOverride: overrideEfectivo ?? null
	};
	// Mantenemos sincronizado el override en la categoria (lo que se usara
	// al re-armar) y el snapshot dentro del bracketConfig (lo que se uso
	// efectivamente esta vez).
	batch.update(categoriaDoc(torneoId, categoriaId), {
		bracketConfig: config,
		bracketSlotsOverride: overrideEfectivo ?? null
	});

	await batch.commit();
}

// Guarda solo el override de cruces en la categoria — sin armar el bracket.
// Util cuando el organizador edita cruces en el preview (antes de que las
// zonas terminen). Al armar el bracket mas tarde, se lee desde aca.
export async function guardarOverrideBracket(
	torneoId: string,
	categoriaId: string,
	slotsOverride: (ParejaRef | null)[] | null
): Promise<void> {
	await updateDoc(categoriaDoc(torneoId, categoriaId), {
		bracketSlotsOverride: slotsOverride
	});
}

// Borra el bracket: elimina todos los partidos con zonaId=null y resetea
// categoria.bracketConfig a null.
export async function desarmarBracketCategoria(
	torneoId: string,
	categoriaId: string
): Promise<void> {
	const partidosViejos = await getDocs(
		query(partidosCol(torneoId, categoriaId), where('zonaId', '==', null))
	);
	const batch = writeBatch(db());
	for (const snap of partidosViejos.docs) {
		batch.delete(snap.ref);
	}
	// Desarmar tambien limpia el override: el organizador parte de cero.
	batch.update(categoriaDoc(torneoId, categoriaId), {
		bracketConfig: null,
		bracketSlotsOverride: null
	});
	await batch.commit();
}

// Helper de UI: descripcion textual de un PosicionZona (para mostrar el
// label simbolico cuando todavia no se puede resolver).
export function descripcionPosicionZona(ref: ParejaRef): string | null {
	if (ref.tipo !== 'PosicionZona') return null;
	return `${ref.posicion}° de Zona ${ref.letraZona}`;
}

// Suscribe al stream de partidos del bracket (zonaId === null). Reusable
// desde la pantalla /bracket.
export function suscribirBracket(
	torneoId: string,
	categoriaId: string,
	callback: (partidos: Partido[]) => void
): () => void {
	const q = query(
		partidosCol(torneoId, categoriaId),
		where('zonaId', '==', null)
	);
	return onSnapshot(q, (snap) => {
		const partidos: Partido[] = snap.docs.map((d) => ({
			id: d.id,
			...d.data()
		}));
		// Orden temporal: por ronda, despues por posicion.
		partidos.sort((a, b) => {
			if ((a.ronda ?? 0) !== (b.ronda ?? 0)) return (a.ronda ?? 0) - (b.ronda ?? 0);
			return (a.posicionEnRonda ?? 0) - (b.posicionEnRonda ?? 0);
		});
		callback(partidos);
	});
}
