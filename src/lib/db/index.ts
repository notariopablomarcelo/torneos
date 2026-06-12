// Entry point del adapter. Switchea entre Firebase y local segun
// VITE_DB_MODE. Los servicios SIEMPRE importan de aca, nunca de
// firebase/firestore directo.
//
// La API expuesta es el subconjunto de Firestore que el codebase usa:
//   - collection, doc, query, where, orderBy, collectionGroup
//   - getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc
//   - writeBatch, onSnapshot
//   - db()  (placeholder en local, instancia real en firebase)
//
// Las firmas son las mismas que Firestore para minimizar cambios.

import { DB_MODE } from '$lib/env';

import * as local from './local';
import * as firebase from './firebase';

const impl = DB_MODE === 'firebase' ? firebase : local;

// Tipamos cada export con la firma del adapter LOCAL (mi propia API
// agnostica). Los services solo dependen de estas firmas — el cast
// silencia las diferencias internas entre firebase/firestore y mi local.
export const collection = impl.collection as typeof local.collection;
export const collectionGroup = impl.collectionGroup as typeof local.collectionGroup;
export const doc = impl.doc as typeof local.doc;
export const query = impl.query as typeof local.query;
export const where = impl.where as typeof local.where;
export const orderBy = impl.orderBy as typeof local.orderBy;
export const getDoc = impl.getDoc as typeof local.getDoc;
export const getDocs = impl.getDocs as typeof local.getDocs;
export const addDoc = impl.addDoc as typeof local.addDoc;
export const setDoc = impl.setDoc as typeof local.setDoc;
export const updateDoc = impl.updateDoc as typeof local.updateDoc;
export const deleteDoc = impl.deleteDoc as typeof local.deleteDoc;
export const writeBatch = impl.writeBatch as typeof local.writeBatch;
export const onSnapshot = impl.onSnapshot as typeof local.onSnapshot;
export const db = impl.db as typeof local.db;

export type {
	CollectionRef,
	CollectionReference,
	DocRef,
	DocumentReference,
	DocumentSnapshot,
	QuerySnapshot,
	Query,
	WriteBatch,
	Unsubscribe
} from './types';
