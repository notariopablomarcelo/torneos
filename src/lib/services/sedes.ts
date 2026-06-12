import {
	addDoc,
	deleteDoc,
	getDoc,
	getDocs,
	onSnapshot,
	orderBy,
	query,
	updateDoc,
	writeBatch
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import {
	canchaDoc,
	canchasCol,
	sedeDoc,
	sedesCol
} from './firestore';
import type { Cancha, CanchaInput, Sede, SedeInput } from '$lib/types/sede';

// =============================================================================
// Sedes
// =============================================================================

export async function crearSede(data: SedeInput): Promise<string> {
	const ref = await addDoc(sedesCol(), {
		...data,
		creadoEn: new Date().toISOString()
	});
	return ref.id;
}

export async function actualizarSede(id: string, data: SedeInput): Promise<void> {
	await updateDoc(sedeDoc(id), data);
}

// Eliminar sede: borra tambien sus canchas. Si la sede esta siendo usada por
// algun torneo (TorneoCancha), el caller decide que hacer; aca solo borramos
// la sede. Cuando llegue Fase 2 sumamos validacion cross-coleccion.
export async function eliminarSede(id: string): Promise<void> {
	const canchas = await getDocs(canchasCol(id));
	const batch = writeBatch(db());
	for (const snap of canchas.docs) batch.delete(snap.ref);
	batch.delete(sedeDoc(id));
	await batch.commit();
}

export async function obtenerSede(id: string): Promise<Sede | null> {
	const snap = await getDoc(sedeDoc(id));
	if (!snap.exists()) return null;
	return { id: snap.id, ...snap.data() };
}

export function suscribirSedes(callback: (sedes: Sede[]) => void): () => void {
	const q = query(sedesCol(), orderBy('nombre'));
	return onSnapshot(q, (snap) => {
		callback(
			snap.docs.map((d) => ({
				id: d.id,
				...d.data()
			}))
		);
	});
}

// =============================================================================
// Canchas
// =============================================================================

export async function crearCancha(
	sedeId: string,
	data: CanchaInput
): Promise<string> {
	const ref = await addDoc(canchasCol(sedeId), {
		...data,
		sedeId,
		creadoEn: new Date().toISOString()
	});
	return ref.id;
}

export async function actualizarCancha(
	sedeId: string,
	id: string,
	data: CanchaInput
): Promise<void> {
	await updateDoc(canchaDoc(sedeId, id), data);
}

export async function eliminarCancha(sedeId: string, id: string): Promise<void> {
	await deleteDoc(canchaDoc(sedeId, id));
}

export function suscribirCanchas(
	sedeId: string,
	callback: (canchas: Cancha[]) => void
): () => void {
	const q = query(canchasCol(sedeId), orderBy('nombre'));
	return onSnapshot(q, (snap) => {
		callback(
			snap.docs.map((d) => ({
				id: d.id,
				...d.data()
			}))
		);
	});
}
