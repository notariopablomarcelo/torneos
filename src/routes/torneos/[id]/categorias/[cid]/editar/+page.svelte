<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import BreadcrumbCard from '$lib/components/BreadcrumbCard.svelte';
	import CategoriaForm from '$lib/components/CategoriaForm.svelte';
	import { suscribirTorneo } from '$lib/services/torneos';
	import {
		actualizarCategoria,
		obtenerCategoria
	} from '$lib/services/categorias';
	import { AMBIENTE } from '$lib/firebase';
	import { generarCategoriaInput } from '$lib/dev/factories';
	import {
		nombreCategoria,
		obtenerCantidadJugadores,
		type Categoria,
		type CategoriaInput,
		type Torneo
	} from '$lib/types/torneo';

	const tid = $derived(page.params.id as string);
	const cid = $derived(page.params.cid as string);

	let torneo = $state<Torneo | null>(null);
	let categoria = $state<Categoria | null>(null);
	let cargando = $state(true);
	let errorCarga = $state<string | null>(null);

	$effect(() => {
		const t = tid;
		const c = cid;
		cargando = true;
		errorCarga = null;
		torneo = null;
		categoria = null;

		let cancelado = false;
		const unsubT = suscribirTorneo(t, (val) => {
			torneo = val;
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
				if (!cancelado) cargando = false;
			}
		})();
		return () => {
			cancelado = true;
			unsubT();
		};
	});

	const onTest = AMBIENTE !== 'prod' ? generarCategoriaInput : undefined;

	async function handleActualizar(data: CategoriaInput) {
		await actualizarCategoria(tid, cid, data);
		await goto(`/torneos/${tid}/categorias/${cid}`);
	}

	function handleCancel() {
		goto(`/torneos/${tid}/categorias/${cid}`);
	}
</script>

<div class="mx-auto max-w-2xl p-4 sm:p-6">
	<a
		href={`/torneos/${tid}/categorias/${cid}`}
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
	{:else if !categoria}
		<div class="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
			No se encontró la categoría.
		</div>
	{:else}
		<BreadcrumbCard
			items={[
				{ prefijo: 'Torneo', label: torneo?.nombre ?? '—' },
				{ prefijo: 'Categoría', label: nombreCategoria(categoria) }
			]}
		/>

		<header class="mb-4">
			<h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">Editar categoría</h1>
		</header>

		<section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-6">
			<CategoriaForm
				initial={{
					nivel: categoria.nivel,
					genero: categoria.genero,
					cupos: categoria.cupos,
					cantidadJugadores: obtenerCantidadJugadores(categoria),
					tamanoPreferido: categoria.tamanoPreferido ?? null,
					modalidadZona4: categoria.modalidadZona4 ?? null,
					clasificanPorZona: categoria.clasificanPorZona ?? null
				}}
				submitLabel="Guardar"
				onSubmit={handleActualizar}
				onCancel={handleCancel}
				{onTest}
			/>
		</section>
	{/if}
</div>
