<script lang="ts">
	import { untrack } from 'svelte';
	import { torneoInputSchema, type TorneoInput } from '$lib/types/torneo';
	import TextField from './TextField.svelte';

	type Props = {
		initial: TorneoInput;
		submitLabel?: string;
		onSubmit: (data: TorneoInput) => Promise<void>;
		onCancel?: () => void;
		onTest?: () => TorneoInput;
	};

	let { initial, submitLabel = 'Guardar', onSubmit, onCancel, onTest }: Props = $props();

	// El form solo toma initial como valores iniciales; cambios posteriores
	// del padre no se reflejan (es por diseño). untrack rompe el rastreo
	// para que Svelte no se queje de capturar un reactivo en $state.
	const seed = untrack(() => initial);
	let nombre = $state(seed.nombre);
	let fechaInicio = $state(seed.fechaInicio);
	let fechaFin = $state(seed.fechaFin);

	let errores = $state<Record<string, string[] | undefined>>({});
	let errorGlobal = $state<string | null>(null);
	let guardando = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		errores = {};
		errorGlobal = null;

		const parsed = torneoInputSchema.safeParse({
			nombre,
			fechaInicio,
			fechaFin
		});

		if (!parsed.success) {
			errores = parsed.error.flatten().fieldErrors;
			return;
		}

		guardando = true;
		try {
			await onSubmit(parsed.data);
		} catch (err) {
			errorGlobal = err instanceof Error ? err.message : 'Error al guardar';
		} finally {
			guardando = false;
		}
	}

	function err(campo: keyof TorneoInput): string | null {
		return errores[campo]?.[0] ?? null;
	}

	function handleTest() {
		if (!onTest) return;
		const datos = onTest();
		nombre = datos.nombre;
		fechaInicio = datos.fechaInicio;
		fechaFin = datos.fechaFin;
		errores = {};
		errorGlobal = null;
	}
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	<TextField id="tor-nombre" label="Nombre del torneo" bind:value={nombre} error={err('nombre')} />

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<TextField
			id="tor-inicio"
			label="Fecha de inicio"
			type="date"
			floating={false}
			bind:value={fechaInicio}
			error={err('fechaInicio')}
		/>
		<TextField
			id="tor-fin"
			label="Fecha de fin"
			type="date"
			floating={false}
			bind:value={fechaFin}
			error={err('fechaFin')}
		/>
	</div>

	{#if errorGlobal}
		<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
			{errorGlobal}
		</div>
	{/if}

	<div class="flex items-center justify-between gap-3 pt-2">
		<div>
			{#if onTest}
				<button
					type="button"
					onclick={handleTest}
					disabled={guardando}
					title="Rellenar con datos de prueba"
					class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-400 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
				>
					<i class="bi bi-magic"></i>
					Test
				</button>
			{/if}
		</div>
		<div class="flex items-center gap-3">
			{#if onCancel}
				<button
					type="button"
					onclick={onCancel}
					disabled={guardando}
					class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
				>
					Cancelar
				</button>
			{/if}
			<button
				type="submit"
				disabled={guardando}
				class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
			>
				{#if guardando}
					<i class="bi bi-arrow-clockwise animate-spin"></i>
				{/if}
				{submitLabel}
			</button>
		</div>
	</div>
</form>
