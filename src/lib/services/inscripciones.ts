import { addDoc, deleteDoc, onSnapshot, updateDoc } from '$lib/db';
import { inscripcionDoc, inscripcionesCol } from './firestore';
import type { Inscripcion, InscripcionInput } from '$lib/types/inscripcion';

export async function crearInscripcion(
	torneoId: string,
	categoriaId: string,
	input: InscripcionInput
): Promise<string> {
	const ref = await addDoc(inscripcionesCol(torneoId, categoriaId), {
		...input,
		torneoId,
		categoriaId,
		creadoEn: new Date().toISOString()
	});
	return ref.id;
}

export async function actualizarInscripcion(
	torneoId: string,
	categoriaId: string,
	id: string,
	input: InscripcionInput
): Promise<void> {
	await updateDoc(inscripcionDoc(torneoId, categoriaId, id), input);
}

export async function eliminarInscripcion(
	torneoId: string,
	categoriaId: string,
	id: string
): Promise<void> {
	await deleteDoc(inscripcionDoc(torneoId, categoriaId, id));
}

// Suscripcion reactiva al listado de inscripciones. Ordenamos en cliente
// (no en Firestore) porque ranking es nullable y orderBy('ranking') excluye
// los documentos sin el campo. El orden final lo arma la pagina con nulls
// al final.
export function suscribirInscripciones(
	torneoId: string,
	categoriaId: string,
	cb: (inscripciones: Inscripcion[]) => void
): () => void {
	return onSnapshot(inscripcionesCol(torneoId, categoriaId), (snap) => {
		cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
	});
}
