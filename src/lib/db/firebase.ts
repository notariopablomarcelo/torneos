// Adapter Firebase: re-exporta las funciones de firebase/firestore tal
// cual + el helper `db()` que ya existe en src/lib/firebase.ts. La API es
// la misma que el adapter local porque firebase/firestore ya tiene esa
// API; el switch entre backends es transparente para los servicios.

export {
	collection,
	collectionGroup,
	doc,
	query,
	where,
	orderBy,
	getDoc,
	getDocs,
	addDoc,
	setDoc,
	updateDoc,
	deleteDoc,
	writeBatch,
	onSnapshot
} from 'firebase/firestore';

export { db } from '$lib/firebase';