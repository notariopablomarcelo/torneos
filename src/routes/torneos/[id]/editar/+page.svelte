<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import TorneoForm from '$lib/components/TorneoForm.svelte';
	import { actualizarTorneo, obtenerTorneo } from '$lib/services/torneos';
	import type { Torneo, TorneoInput } from '$lib/types/torneo';

	const id = $derived(page.params.id as string);

	let torneo = $state<Torneo | null>(null);
	let cargando = $state(true);
	let error = $state<string | null>(null);

	// onMount no puede ser async (devolveria Promise y Svelte la trataria
	// como funcion de cleanup invalida). Lanzamos un IIFE async y manejamos
	// el unmount con un flag cancelado para no mutar state de un componente
	// ya destruido si el await termina tarde.
	onMount(() => {
		let cancelado = false;
		(async () => {
			try {
				const t = await obtenerTorneo(id);
				if (cancelado) return;
				torneo = t;
				if (!t) error = 'No se encontró el torneo';
			} catch (err) {
				if (cancelado) return;
				error = err instanceof Error ? err.message : 'Error al cargar';
			} finally {
				if (!cancelado) cargando = false;
			}
		})();
		return () => {
			cancelado = true;
		};
	});

	async function handleSubmit(data: TorneoInput) {
		await actualizarTorneo(id, data);
		await goto(`/torneos/${id}`, { replaceState: true });
	}

	function handleCancel() {
		goto(`/torneos/${id}`);
	}
</script>

<div class="mx-auto max-w-2xl p-4 sm:p-6">
	<header class="mb-6">
		<a
			href={`/torneos/${id}`}
			class="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
		>
			<i class="bi bi-arrow-left"></i>
			Volver al torneo
		</a>
		<h1 class="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">Editar torneo</h1>
	</header>

	{#if cargando}
		<div class="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500">
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
		</div>
	{:else if error}
		<div class="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-400">
			{error}
		</div>
	{:else if torneo}
		<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
			<TorneoForm
				initial={{
					nombre: torneo.nombre,
					fechaInicio: torneo.fechaInicio,
					fechaFin: torneo.fechaFin
				}}
				submitLabel="Guardar cambios"
				onSubmit={handleSubmit}
				onCancel={handleCancel}
			/>
		</div>
	{/if}
</div>
