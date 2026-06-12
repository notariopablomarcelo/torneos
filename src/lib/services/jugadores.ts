import {
	addDoc,
	deleteDoc,
	getDoc,
	onSnapshot,
	orderBy,
	query,
	updateDoc
} from '$lib/db';
import { jugadorDoc, jugadoresCol } from './firestore';
import type { Jugador, JugadorInput } from '$lib/types/jugador';

export async function crearJugador(input: JugadorInput): Promise<string> {
	const ref = await addDoc(jugadoresCol(), {
		...input,
		creadoEn: new Date().toISOString()
	});
	return ref.id;
}

export async function actualizarJugador(id: string, input: JugadorInput): Promise<void> {
	await updateDoc(jugadorDoc(id), input);
}

export async function eliminarJugador(id: string): Promise<void> {
	await deleteDoc(jugadorDoc(id));
}

export async function obtenerJugador(id: string): Promise<Jugador | null> {
	const snap = await getDoc(jugadorDoc(id));
	if (!snap.exists()) return null;
	return { id: snap.id, ...snap.data() };
}

// Suscripcion reactiva al listado completo ordenado por nombre.
export function suscribirJugadores(cb: (jugadores: Jugador[]) => void): () => void {
	const q = query(jugadoresCol(), orderBy('nombreCompleto', 'asc'));
	return onSnapshot(q, (snap) => {
		cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
	});
}
