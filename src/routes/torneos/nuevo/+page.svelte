<script lang="ts">
	import { goto } from '$app/navigation';
	import TorneoForm from '$lib/components/TorneoForm.svelte';
	import { crearTorneo } from '$lib/services/torneos';
	import { AMBIENTE } from '$lib/firebase';
	import { generarTorneoInput } from '$lib/dev/factories';
	import type { TorneoInput } from '$lib/types/torneo';

	// Defaults razonables. Tendran que completarse antes de poder guardar
	// (validacion Zod).
	const hoy = new Date().toISOString().slice(0, 10);
	const initial: TorneoInput = {
		nombre: '',
		fechaInicio: hoy,
		fechaFin: hoy
	};

	// El boton "Test" solo aparece fuera de produccion. AMBIENTE viene del
	// switch test/prod en firebase.ts.
	const onTest = AMBIENTE !== 'prod' ? generarTorneoInput : undefined;

	async function handleSubmit(data: TorneoInput) {
		const id = await crearTorneo(data);
		await goto(`/torneos/${id}`, { replaceState: true });
	}

	function handleCancel() {
		goto('/torneos');
	}
</script>

<div class="mx-auto max-w-2xl p-4 sm:p-6">
	<header class="mb-6">
		<a
			href="/torneos"
			class="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
		>
			<i class="bi bi-arrow-left"></i>
			Torneos
		</a>
		<h1 class="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">Nuevo torneo</h1>
	</header>

	<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
		<TorneoForm
			{initial}
			submitLabel="Crear"
			onSubmit={handleSubmit}
			onCancel={handleCancel}
			{onTest}
		/>
	</div>
</div>
