import {
	collection,
	doc,
	type CollectionReference,
	type DocumentReference
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import type { Categoria, Torneo } from '$lib/types/torneo';

// Referencias tipadas a las colecciones y documentos. Las paginas y servicios
// arman queries sobre estas helpers, en lugar de repetir el path como string.
// El cast a CollectionReference<Omit<T, 'id'>> le dice a Firestore que shape
// esperar al leer; el id se inyecta a mano desde snap.id.

type TorneoDoc = Omit<Torneo, 'id'>;
type CategoriaDoc = Omit<Categoria, 'id'>;

export const torneosCol = (): CollectionReference<TorneoDoc> =>
	collection(db(), 'torneos') as CollectionReference<TorneoDoc>;

export const torneoDoc = (id: string): DocumentReference<TorneoDoc> =>
	doc(db(), 'torneos', id) as DocumentReference<TorneoDoc>;

export const categoriasCol = (torneoId: string): CollectionReference<CategoriaDoc> =>
	collection(db(), 'torneos', torneoId, 'categorias') as CollectionReference<CategoriaDoc>;

export const categoriaDoc = (
	torneoId: string,
	id: string
): DocumentReference<CategoriaDoc> =>
	doc(db(), 'torneos', torneoId, 'categorias', id) as DocumentReference<CategoriaDoc>;
