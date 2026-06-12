import {
	addDoc,
	deleteDoc,
	getDoc,
	onSnapshot,
	orderBy,
	query,
	updateDoc
} from '$lib/db';
import { categoriaDoc, categoriasCol } from './firestore';
import type { Categoria, CategoriaInput } from '$lib/types/torneo';

export async function crearCategoria(
	torneoId: string,
	input: CategoriaInput
): Promise<string> {
	const ref = await addDoc(categoriasCol(torneoId), {
		...input,
		torneoId,
		creadoEn: new Date().toISOString()
	});
	return ref.id;
}

export async function actualizarCategoria(
	torneoId: string,
	id: string,
	input: CategoriaInput
): Promise<void> {
	await updateDoc(categoriaDoc(torneoId, id), input);
}

export async function eliminarCategoria(torneoId: string, id: string): Promise<void> {
	await deleteDoc(categoriaDoc(torneoId, id));
}

export async function obtenerCategoria(
	torneoId: string,
	id: string
): Promise<Categoria | null> {
	const snap = await getDoc(categoriaDoc(torneoId, id));
	if (!snap.exists()) return null;
	return { id: snap.id, ...snap.data() };
}

export function suscribirCategorias(
	torneoId: string,
	cb: (cats: Categoria[]) => void
): () => void {
	const q = query(categoriasCol(torneoId), orderBy('creadoEn', 'asc'));
	return onSnapshot(q, (snap) => {
		cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
	});
}
