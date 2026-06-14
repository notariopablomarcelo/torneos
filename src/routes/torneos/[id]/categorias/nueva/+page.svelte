<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import BreadcrumbCard from '$lib/components/BreadcrumbCard.svelte';
	import CategoriaWizard from '$lib/components/CategoriaWizard.svelte';
	import { suscribirTorneo } from '$lib/services/torneos';
	import { crearCategoria } from '$lib/services/categorias';
	import { AMBIENTE } from '$lib/firebase';
	import { generarCategoriaInput } from '$lib/dev/factories';
	import type { CategoriaInput, Torneo } from '$lib/types/torneo';

	const tid = $derived(page.params.id as string);

	let torneo = $state<Torneo | null>(null);
	let cargando = $state(true);

	$effect(() => {
		const t = tid;
		cargando = true;
		torneo = null;
		const unsubT = suscribirTorneo(t, (val) => {
			torneo = val;
			cargando = false;
		});
		return () => unsubT();
	});

	const onTest = AMBIENTE !== 'prod' ? generarCategoriaInput : undefined;

	async function handleCrear(data: CategoriaInput) {
		await crearCategoria(tid, data);
		await goto(`/torneos/${tid}`);
	}

	function handleCancel() {
		goto(`/torneos/${tid}`);
	}
</script>

<div class="mx-auto max-w-2xl p-4 sm:p-6">
	<a
		href={`/torneos/${tid}`}
		class="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
	>
		<i class="bi bi-arrow-left"></i>
		Volver
	</a>

	{#if cargando}
		<div class="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500">
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
		</div>
	{:else if !torneo}
		<div class="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-400">
			No se encontró el torneo.
		</div>
	{:else}
		<BreadcrumbCard items={[{ prefijo: 'Torneo', label: torneo.nombre }]} />

		<header class="mb-4">
			<h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">Nueva categoría</h1>
		</header>

		<section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-6">
			<CategoriaWizard onSubmit={handleCrear} onCancel={handleCancel} {onTest} />
		</section>
	{/if}
</div>
