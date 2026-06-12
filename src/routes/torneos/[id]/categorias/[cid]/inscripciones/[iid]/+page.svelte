<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import BreadcrumbCard from '$lib/components/BreadcrumbCard.svelte';
	import InscripcionForm from '$lib/components/InscripcionForm.svelte';
	import { suscribirTorneo } from '$lib/services/torneos';
	import { rangoFechasInclusivo } from '$lib/dates';
	import { obtenerCategoria } from '$lib/services/categorias';
	import { suscribirJugadores } from '$lib/services/jugadores';
	import {
		suscribirInscripciones,
		actualizarInscripcion,
		eliminarInscripcion
	} from '$lib/services/inscripciones';
	import {
		nombreCategoria,
		obtenerCantidadJugadores,
		sustantivoInscripcion,
		type Categoria,
		type Torneo
	} from '$lib/types/torneo';
	import {
		nombreInscripcion,
		type Inscripcion,
		type InscripcionInput
	} from '$lib/types/inscripcion';
	import type { Jugador } from '$lib/types/jugador';

	const tid = $derived(page.params.id as string);
	const cid = $derived(page.params.cid as string);
	const iid = $derived(page.params.iid as string);

	let torneo = $state<Torneo | null>(null);
	let categoria = $state<Categoria | null>(null);
	let inscripciones = $state<Inscripcion[]>([]);
	let jugadores = $state<Jugador[]>([]);
	let cargandoCategoria = $state(true);
	let cargandoJugadores = $state(true);
	let cargandoInscripciones = $state(true);
	let errorCarga = $state<string | null>(null);

	const cargando = $derived(
		cargandoCategoria || cargandoJugadores || cargandoInscripciones
	);

	const cantidad = $derived(categoria ? obtenerCantidadJugadores(categoria) : 2);
	const jugadoresPorId = $derived(new Map(jugadores.map((j) => [j.id, j])));
	const inscripcion = $derived(
		inscripciones.find((i) => i.id === iid) ?? null
	);

	$effect(() => {
		const t = tid;
		const c = cid;
		cargandoCategoria = true;
		cargandoJugadores = true;
		cargandoInscripciones = true;
		errorCarga = null;
		torneo = null;
		categoria = null;
		inscripciones = [];

		let cancelado = false;
		const unsubT = suscribirTorneo(t, (val) => {
			torneo = val;
		});
		const unsubI = suscribirInscripciones(t, c, (val) => {
			inscripciones = val;
			cargandoInscripciones = false;
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

	// Excluir del picker los jugadores ya tomados por OTRAS inscripciones de
	// la categoria. Los propios siguen visibles para poder reasignar slots.
	const excluirEdicion = $derived.by(() => {
		if (!inscripcion) return [];
		const propios = new Set(inscripcion.jugadores);
		return inscripciones
			.flatMap((i) => i.jugadores)
			.filter((id) => !propios.has(id));
	});

	const fechasTorneo = $derived(
		torneo ? rangoFechasInclusivo(torneo.fechaInicio, torneo.fechaFin) : []
	);

	async function handleActualizar(data: InscripcionInput) {
		await actualizarInscripcion(tid, cid, iid, data);
		await goto(`/torneos/${tid}/categorias/${cid}/inscripciones`);
	}

	async function handleEliminar() {
		if (!inscripcion) return;
		const nombre = nombreInscripcion(inscripcion, jugadoresPorId);
		const ok = confirm(
			`¿Eliminar la ${sustantivoInscripcion(cantidad)} "${nombre}"?`
		);
		if (!ok) return;
		await eliminarInscripcion(tid, cid, iid);
		await goto(`/torneos/${tid}/categorias/${cid}/inscripciones`);
	}

	function handleCancel() {
		goto(`/torneos/${tid}/categorias/${cid}/inscripciones`);
	}
</script>

<div class="mx-auto max-w-2xl p-4 sm:p-6">
	<a
		href={`/torneos/${tid}/categorias/${cid}/inscripciones`}
		class="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
	>
		<i class="bi bi-arrow-left"></i>
		Volver
	</a>

	{#if cargando}
		<div class="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500">
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
		</div>
	{:else if errorCarga}
		<div class="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-400">
			{errorCarga}
		</div>
	{:else if !inscripcion}
		<div class="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
			No se encontró la inscripción.
		</div>
	{:else}
		<BreadcrumbCard
			items={[
				{ prefijo: 'Torneo', label: torneo?.nombre ?? '—' },
				{
					prefijo: 'Categoría',
					label: categoria ? nombreCategoria(categoria) : '—'
				}
			]}
		/>

		<header class="mb-4">
			<h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">
				Editar {sustantivoInscripcion(cantidad)}
			</h1>
			<p class="text-xs text-gray-500 dark:text-gray-400">
				{nombreInscripcion(inscripcion, jugadoresPorId)}
			</p>
		</header>

		<section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-6">
			<InscripcionForm
				initial={{
					jugadores: inscripcion.jugadores,
					ranking: inscripcion.ranking,
					bloqueosJugadores: inscripcion.bloqueosJugadores
				}}
				cantidadJugadores={cantidad}
				{jugadores}
				excluirGlobal={excluirEdicion}
				{fechasTorneo}
				submitLabel="Guardar"
				onSubmit={handleActualizar}
				onCancel={handleCancel}
				onEliminar={handleEliminar}
			/>
		</section>
	{/if}
</div>
