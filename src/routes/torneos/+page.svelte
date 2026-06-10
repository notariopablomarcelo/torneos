<script lang="ts">
	import { onMount } from 'svelte';
	import { suscribirTorneos } from '$lib/services/torneos';
	import type { Torneo } from '$lib/types/torneo';
	import RangoFechas from '$lib/components/RangoFechas.svelte';

	let torneos = $state<Torneo[]>([]);
	let cargando = $state(true);

	onMount(() => {
		const unsub = suscribirTorneos((t) => {
			torneos = t;
			cargando = false;
		});
		return unsub;
	});
</script>

<div class="mx-auto max-w-4xl p-4 sm:p-6">
	<header class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Torneos</h1>
			<p class="text-sm text-gray-500">Listado de todos los torneos cargados.</p>
		</div>
		<a
			href="/torneos/nuevo"
			title="Nuevo torneo"
			aria-label="Nuevo torneo"
			class="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600"
		>
			<i class="bi bi-plus-lg text-lg"></i>
		</a>
	</header>

	{#if cargando}
		<div class="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400">
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
			<p class="mt-2 text-sm">Cargando…</p>
		</div>
	{:else if torneos.length === 0}
		<div
			class="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500"
		>
			<i class="bi bi-trophy text-4xl text-gray-300"></i>
			<p class="mt-3 font-medium">Todavía no hay torneos</p>
			<p class="text-sm">Empezá creando el primero.</p>
			<a
				href="/torneos/nuevo"
				class="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
			>
				<i class="bi bi-plus-lg"></i>
				Crear torneo
			</a>
		</div>
	{:else}
		<ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			{#each torneos as t (t.id)}
				<li>
					<a
						href={`/torneos/${t.id}`}
						class="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
					>
						<h2 class="mb-2 font-semibold text-gray-900">{t.nombre}</h2>
						<RangoFechas inicio={t.fechaInicio} fin={t.fechaFin} />
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
