<script lang="ts">
	import { onMount } from 'svelte';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import SedeForm from '$lib/components/SedeForm.svelte';
	import {
		suscribirSedes,
		crearSede
	} from '$lib/services/sedes';
	import { AMBIENTE } from '$lib/firebase';
	import { generarSedeInput } from '$lib/dev/factories';
	import type { Sede, SedeInput } from '$lib/types/sede';

	let sedes = $state<Sede[]>([]);
	let cargando = $state(true);
	let sheetNueva = $state(false);

	onMount(() => {
		const unsub = suscribirSedes((s) => {
			sedes = s;
			cargando = false;
		});
		return unsub;
	});

	async function handleCrear(data: SedeInput) {
		await crearSede(data);
		sheetNueva = false;
	}

	const initialNueva: SedeInput = {
		nombre: '',
		direccion: null
	};

	const onTest = AMBIENTE !== 'prod' ? generarSedeInput : undefined;
</script>

<div class="mx-auto max-w-4xl p-4 sm:p-6">
	<header class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Sedes</h1>
		<button
			type="button"
			onclick={() => (sheetNueva = true)}
			title="Nueva sede"
			aria-label="Nueva sede"
			class="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600"
		>
			<i class="bi bi-plus-lg text-lg"></i>
		</button>
	</header>

	{#if cargando}
		<div
			class="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500"
		>
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
			<p class="mt-2 text-sm">Cargando…</p>
		</div>
	{:else if sedes.length === 0}
		<div
			class="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
		>
			<i class="bi bi-geo-alt text-4xl text-gray-300 dark:text-gray-600"></i>
			<p class="mt-3 font-medium">Todavía no hay sedes</p>
			<p class="text-sm">Cargá la primera para empezar a usar canchas en los torneos.</p>
			<button
				type="button"
				onclick={() => (sheetNueva = true)}
				class="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
			>
				<i class="bi bi-plus-lg"></i>
				Nueva sede
			</button>
		</div>
	{:else}
		<p class="mb-2 text-xs text-gray-400 dark:text-gray-500">
			{sedes.length}
			{sedes.length === 1 ? 'sede' : 'sedes'}
		</p>
		<ul class="space-y-1.5">
			{#each sedes as s (s.id)}
				<li>
					<a
						href={`/sedes/${s.id}`}
						class="flex w-full items-center gap-2.5 rounded-[10px] border border-gray-200 bg-white px-3.5 py-3 text-left hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:bg-gray-800"
					>
						<span
							class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
						>
							<i class="bi bi-geo-alt"></i>
						</span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-[15px] font-semibold text-gray-900 dark:text-gray-100">
								{s.nombre}
							</p>
							{#if s.direccion}
								<p class="truncate text-xs text-gray-500 dark:text-gray-400">{s.direccion}</p>
							{:else}
								<p class="truncate text-xs text-gray-400 italic dark:text-gray-500">Sin dirección</p>
							{/if}
						</div>
						<i class="bi bi-chevron-right shrink-0 text-base text-gray-300 dark:text-gray-600"></i>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<BottomSheet open={sheetNueva} onClose={() => (sheetNueva = false)} title="Nueva sede">
	<SedeForm
		initial={initialNueva}
		submitLabel="Crear"
		onSubmit={handleCrear}
		onCancel={() => (sheetNueva = false)}
		{onTest}
	/>
</BottomSheet>
