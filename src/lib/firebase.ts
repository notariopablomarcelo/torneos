import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { browser } from '$app/environment';

// Dos proyectos Firebase: uno para test y otro para prod. El selector
// vive acá adentro para que el resto de la app no tenga que pensar en eso.
// El switch se basa en hostname: si la app corre en el dominio de prod,
// usa la config de prod; en cualquier otro caso (test, dev), usa la de test.

const CONFIG_TEST = {
	apiKey: 'PENDIENTE',
	authDomain: 'PENDIENTE.firebaseapp.com',
	projectId: 'PENDIENTE',
	storageBucket: 'PENDIENTE.appspot.com',
	messagingSenderId: 'PENDIENTE',
	appId: 'PENDIENTE'
} as const;

const CONFIG_PROD = {
	apiKey: 'PENDIENTE',
	authDomain: 'PENDIENTE.firebaseapp.com',
	projectId: 'PENDIENTE',
	storageBucket: 'PENDIENTE.appspot.com',
	messagingSenderId: 'PENDIENTE',
	appId: 'PENDIENTE'
} as const;

// Hostnames considerados producción. El resto cae a test.
const HOSTNAMES_PROD: readonly string[] = [];

function detectarAmbiente(): 'prod' | 'test' {
	if (!browser) return 'test';
	return HOSTNAMES_PROD.includes(window.location.hostname) ? 'prod' : 'test';
}

export const AMBIENTE = detectarAmbiente();

const config = AMBIENTE === 'prod' ? CONFIG_PROD : CONFIG_TEST;

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

export function firebaseApp(): FirebaseApp {
	if (!_app) _app = initializeApp(config);
	return _app;
}

export function auth(): Auth {
	if (!_auth) _auth = getAuth(firebaseApp());
	return _auth;
}

export function db(): Firestore {
	if (!_db) _db = getFirestore(firebaseApp());
	return _db;
}
