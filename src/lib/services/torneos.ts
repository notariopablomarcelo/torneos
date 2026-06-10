import {
	addDoc,
	deleteDoc,
	getDoc,
	onSnapshot,
	orderBy,
	query,
	updateDoc
} from 'firebase/firestore';
import { torneoDoc, torneosCol } from './firestore';
import type { Torneo, TorneoInput } from '$lib/types/torneo';

export async function crearTorneo(input: TorneoInput): Promise<string> {
	const ref = await addDoc(torneosCol(), {
		...input,
		creadoEn: new Date().toISOString()
	});
	return ref.id;
}

export async function actualizarTorneo(id: string, input: TorneoInput): Promise<void> {
	await updateDoc(torneoDoc(id), input);
}

export async function eliminarTorneo(id: string): Promise<void> {
	await deleteDoc(torneoDoc(id));
}

export async function obtenerTorneo(id: string): Promise<Torneo | null> {
	const snap = await getDoc(torneoDoc(id));
	if (!snap.exists()) return null;
	return { id: snap.id, ...snap.data() };
}

// Suscripcion reactiva al listado completo. El caller recibe los torneos
// cada vez que algo cambia y se queda con el unsubscribe para limpiar.
export function suscribirTorneos(cb: (torneos: Torneo[]) => void): () => void {
	const q = query(torneosCol(), orderBy('fechaInicio', 'desc'));
	return onSnapshot(q, (snap) => {
		cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
	});
}

export function suscribirTorneo(
	id: string,
	cb: (torneo: Torneo | null) => void
): () => void {
	return onSnapshot(torneoDoc(id), (snap) => {
		cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
	});
}
