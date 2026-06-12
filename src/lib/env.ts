// Constantes de entorno desacopladas de Firebase para que el adapter
// pueda decidir el backend (local vs firebase) sin importar firebase.ts.

import { browser } from '$app/environment';

// Hostnames considerados produccion (mismo criterio que firebase.ts).
const HOSTNAMES_PROD: readonly string[] = [];

function detectarAmbiente(): 'prod' | 'test' {
	if (!browser) return 'test';
	return HOSTNAMES_PROD.includes(window.location.hostname) ? 'prod' : 'test';
}

export const AMBIENTE = detectarAmbiente();

// Modo del backend. 'local' usa data/db.json via /api/db, 'firebase' usa
// Firestore real. Variable de entorno VITE_DB_MODE; default 'local' en dev
// para no consumir cuota de Firebase.
export const DB_MODE: 'local' | 'firebase' =
	(import.meta.env.VITE_DB_MODE as 'local' | 'firebase' | undefined) ??
	'local';
