<script lang="ts">
	import { page } from '$app/state';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import BreadcrumbCard from '$lib/components/BreadcrumbCard.svelte';
	import InscripcionForm from '$lib/components/InscripcionForm.svelte';
	import InscripcionNombres from '$lib/components/InscripcionNombres.svelte';
	import { suscribirTorneo } from '$lib/services/torneos';
	import { rangoFechasInclusivo } from '$lib/dates';
	import { obtenerCategoria } from '$lib/services/categorias';
	import { crearJugador, suscribirJugadores } from '$lib/services/jugadores';
	import {
		suscribirInscripciones,
		crearInscripcion
	} from '$lib/services/inscripciones';
	import { AMBIENTE } from '$lib/firebase';
	import {
		generarInscripcionInput,
		generarJugadorInput
	} from '$lib/dev/factories';
	import {
		nombreCategoria,
		obtenerCantidadJugadores,
		sustantivoInscripcion,
		type Categoria,
		type Torneo
	} from '$lib/types/torneo';
	import {
		nombreInscripcion,
		nombresJugadores,
		type Inscripcion,
		type InscripcionInput
	} from '$lib/types/inscripcion';
	// El edit de cada inscripcion vive en su propia pantalla
	// (/inscripciones/[iid]); la lista solo navega hacia alla.
	import type { Jugador } from '$lib/types/jugador';

	const tid = $derived(page.params.id as string);
	const cid = $derived(page.params.cid as string);

	let torneo = $state<Torneo | null>(null);
	let categoria = $state<Categoria | null>(null);
	let inscripciones = $state<Inscripcion[]>([]);
	let jugadores = $state<Jugador[]>([]);
	let cargandoCategoria = $state(true);
	let cargandoJugadores = $state(true);
	let errorCarga = $state<string | null>(null);

	const cargando = $derived(cargandoCategoria || cargandoJugadores);

	let sheetNueva = $state(false);

	const cantidad = $derived(categoria ? obtenerCantidadJugadores(categoria) : 2);
	const jugadoresPorId = $derived(new Map(jugadores.map((j) => [j.id, j])));

	$effect(() => {
		const t = tid;
		const c = cid;
		cargandoCategoria = true;
		cargandoJugadores = true;
		errorCarga = null;
		torneo = null;
		categoria = null;
		inscripciones = [];
		sheetNueva = false;

		let cancelado = false;
		const unsubT = suscribirTorneo(t, (val) => {
			torneo = val;
		});
		const unsubI = suscribirInscripciones(t, c, (val) => {
			inscripciones = val;
		});
		const unsubJ = suscribirJugadores((val) => {
			jugadores = val;
			cargandoJugadores = false;
		});
		(async () => {
			try {
				const cat = await obtenerCategoria(t, c);
				if (cancelado) return;
				categoria = cat;
				if (!cat) errorCarga = 'No se encontró la categoría.';
			} catch (err) {
				if (cancelado) return;
				errorCarga = err instanceof Error ? err.message : 'Error al cargar.';
			} finally {
				if (!cancelado) cargandoCategoria = false;
			}
		})();
		return () => {
			cancelado = true;
			unsubT();
			unsubI();
			unsubJ();
		};
	});

	async function handleCrear(data: InscripcionInput) {
		await crearInscripcion(tid, cid, data);
		sheetNueva = false;
	}

	const ocupadosGlobal = $derived(inscripciones.flatMap((i) => i.jugadores));
	const excluirNueva = $derived(ocupadosGlobal);

	// Lista de fechas del torneo (YYYY-MM-DD) para la UI de bloqueos por
	// jugador del form de creacion. Vacio mientras carga.
	const fechasTorneo = $derived(
		torneo ? rangoFechasInclusivo(torneo.fechaInicio, torneo.fechaFin) : []
	);
	const cantidadDisponiblesNueva = $derived(jugadores.length - ocupadosGlobal.length);

	const rankingsExistentes = $derived(
		inscripciones.map((i) => i.ranking).filter((r): r is number => r !== null)
	);

	const inscripcionesOrdenadas = $derived(
		[...inscripciones].sort((a, b) => {
			if (a.ranking === null && b.ranking === null) return a.creadoEn.localeCompare(b.creadoEn);
			if (a.ranking === null) return 1;
			if (b.ranking === null) return -1;
			return a.ranking - b.ranking;
		})
	);

	const initialNueva: InscripcionInput = {
		jugadores: [],
		ranking: null
	};

	const onTestNueva = $derived(
		AMBIENTE !== 'prod'
			? () => {
					const ocupados = new Set(ocupadosGlobal);
					const disponibles = jugadores.filter((j) => !ocupados.has(j.id));
					return generarInscripcionInput(disponibles, cantidad, rankingsExistentes);
				}
			: undefined
	);

	// =====
	// Test: autogenerar todas las parejas necesarias para llenar la categoria.
	// Crea jugadores nuevos si la base no tiene suficientes (con dedupe por
	// nombreCompleto). Util en desarrollo para probar el flujo entero sin
	// cargar 30 jugadores a mano.
	// =====

	const TARGET_DEFAULT_SIN_CUPOS = 8;
	let generandoTodo = $state(false);

	const targetInscripciones = $derived(
		categoria?.cupos ?? TARGET_DEFAULT_SIN_CUPOS
	);
	const parejasFaltantes = $derived(
		Math.max(0, targetInscripciones - inscripciones.length)
	);

	async function handleTestLlenar() {
		if (!categoria || parejasFaltantes === 0) return;
		generandoTodo = true;
		try {
			// Trabajo en memoria contra una copia mutable de las ids de jugadores
			// disponibles. Asi no dependo de que `jugadores` (suscripcion
			// realtime) se actualice entre awaits.
			const ocupadosSet = new Set(ocupadosGlobal);
			const disponiblesIds: string[] = jugadores
				.filter((j) => !ocupadosSet.has(j.id))
				.map((j) => j.id);

			const necesarios = parejasFaltantes * cantidad;
			const aCrear = Math.max(0, necesarios - disponiblesIds.length);

			// 1. Crear jugadores nuevos (si hace falta) con nombres unicos.
			if (aCrear > 0) {
				const nombresUsados = new Set(jugadores.map((j) => j.nombreCompleto));
				for (let i = 0; i < aCrear; i += 1) {
					const datos = generarJugadorInput(nombresUsados);
					nombresUsados.add(datos.nombreCompleto);
					const nuevoId = await crearJugador(datos);
					disponiblesIds.push(nuevoId);
				}
			}

			// 2. Crear las parejas: cada una toma `cantidad` jugadores random
			//    de los disponibles. Ranking incremental al final del orden.
			let rankingProx =
				Math.max(0, ...inscripciones.map((i) => i.ranking ?? 0)) + 1;
			for (let i = 0; i < parejasFaltantes; i += 1) {
				const seleccion: string[] = [];
				for (let k = 0; k < cantidad; k += 1) {
					const idx = Math.floor(Math.random() * disponiblesIds.length);
					const [id] = disponiblesIds.splice(idx, 1);
					if (id) seleccion.push(id);
				}
				if (seleccion.length !== cantidad) break; // safeguard
				await crearInscripcion(tid, cid, {
					jugadores: seleccion,
					ranking: rankingProx
				});
				rankingProx += 1;
			}
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Error al llenar inscripciones');
		} finally {
			generandoTodo = false;
		}
	}

	const mostrarBotonTest = $derived(
		AMBIENTE !== 'prod' && parejasFaltantes > 0
	);
</script>

<div class="mx-auto max-w-4xl p-4 sm:p-6">
	{#if cargando}
		<div class="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500">
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
		</div>
	{:else if errorCarga}
		<div class="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-400">
			{errorCarga}
		</div>
	{:else if categoria}
		<a
			href={`/torneos/${tid}/categorias/${cid}`}
			class="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
		>
			<i class="bi bi-arrow-left"></i>
			Volver
		</a>

		<BreadcrumbCard
			items={[
				{ prefijo: 'Torneo', label: torneo?.nombre ?? '—' },
				{ prefijo: 'Categoría', label: nombreCategoria(categoria) }
			]}
		/>

		<header class="mb-4 flex items-center justify-between gap-2">
			<h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">Inscripciones</h1>
			<div class="flex items-center gap-2">
				{#if mostrarBotonTest}
					<button
						type="button"
						onclick={handleTestLlenar}
						disabled={generandoTodo}
						title="Llenar {parejasFaltantes} {parejasFaltantes === 1 ? 'pareja' : 'parejas'} con datos al azar"
						class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-400 px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
					>
						{#if generandoTodo}
							<i class="bi bi-arrow-clockwise animate-spin"></i>
						{:else}
							<i class="bi bi-magic"></i>
						{/if}
						<span>Test ×{parejasFaltantes}</span>
					</button>
				{/if}
				<button
					type="button"
					onclick={() => (sheetNueva = true)}
					disabled={cantidadDisponiblesNueva < cantidad}
					aria-label={`Nueva ${sustantivoInscripcion(cantidad)}`}
					title={`Nueva ${sustantivoInscripcion(cantidad)}`}
					class="inline-flex items-center justify-center rounded-lg bg-brand-500 px-3 py-2 text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<i class="bi bi-plus-lg text-base"></i>
				</button>
			</div>
		</header>

		{#if jugadores.length < cantidad}
			<div
				class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
			>
				<i class="bi bi-info-circle"></i>
				Faltan jugadores en la base. Cargá al menos {cantidad} desde
				<a href="/jugadores" class="font-medium underline">Jugadores</a> antes de inscribir.
			</div>
		{:else if cantidadDisponiblesNueva < cantidad}
			<div
				class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
			>
				<i class="bi bi-info-circle"></i>
				Todos los jugadores de la base ya están inscriptos en esta categoría.
			</div>
		{/if}

		{#if inscripciones.length === 0}
			<div
				class="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
			>
				<i class="bi bi-people text-4xl text-gray-300 dark:text-gray-600"></i>
				<p class="mt-3 font-medium">Todavía no hay inscripciones</p>
				<p class="text-sm">
					Cargá la primera para empezar a armar las zonas después.
				</p>
			</div>
		{:else}
			<p class="mb-2 text-xs text-gray-400 dark:text-gray-500">
				{inscripciones.length}
				{inscripciones.length === 1
					? sustantivoInscripcion(cantidad)
					: sustantivoInscripcion(cantidad) + 's'}
			</p>
			<ul class="space-y-1.5">
				{#each inscripcionesOrdenadas as i (i.id)}
					<li>
						<a
							href={`/torneos/${tid}/categorias/${cid}/inscripciones/${i.id}`}
							aria-label="Editar {nombreInscripcion(i, jugadoresPorId)}"
							class="flex w-full items-start gap-3 rounded-[10px] border border-gray-200 bg-white p-3 text-left hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:bg-gray-800"
						>
							<span
								title={i.ranking === null ? 'Sin ranking' : `Ranking ${i.ranking}`}
								class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold {i.ranking ===
								null
									? 'bg-gray-50 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
									: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}"
							>
								{i.ranking ?? '–'}
							</span>
							<div class="min-w-0 flex-1">
								<InscripcionNombres
									nombres={nombresJugadores(i, jugadoresPorId)}
									tieneBloqueos={(i.bloqueosJugadores?.length ?? 0) > 0}
								/>
							</div>
							<i class="bi bi-chevron-right shrink-0 text-base text-gray-300 dark:text-gray-600"></i>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<BottomSheet
	open={sheetNueva}
	onClose={() => (sheetNueva = false)}
	title={`Nueva ${sustantivoInscripcion(cantidad)}`}
>
	<InscripcionForm
		initial={initialNueva}
		cantidadJugadores={cantidad}
		{jugadores}
		excluirGlobal={excluirNueva}
		{fechasTorneo}
		submitLabel="Crear"
		onSubmit={handleCrear}
		onCancel={() => (sheetNueva = false)}
		onTest={onTestNueva}
	/>
</BottomSheet>

