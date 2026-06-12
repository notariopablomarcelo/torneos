<script lang="ts">
	import { untrack } from 'svelte';
	import { sedeInputSchema, type SedeInput } from '$lib/types/sede';
	import TextField from './TextField.svelte';

	type Props = {
		initial: SedeInput;
		submitLabel?: string;
		onSubmit: (data: SedeInput) => Promise<void>;
		onCancel?: () => void;
		onTest?: () => SedeInput;
		onEliminar?: () => Promise<void>;
	};

	let {
		initial,
		submitLabel = 'Guardar',
		onSubmit,
		onCancel,
		onTest,
		onEliminar
	}: Props = $props();

	const seed = untrack(() => initial);
	let nombre = $state(seed.nombre);
	let direccion = $state(seed.direccion ?? '');

	let errores = $state<Record<string, string[] | undefined>>({});
	let errorGlobal = $state<string | null>(null);
	let guardando = $state(false);
	let borrando = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		errores = {};
		errorGlobal = null;

		const direccionNorm = direccion.trim();
		const parsed = sedeInputSchema.safeParse({
			nombre,
			direccion: direccionNorm === '' ? null : direccionNorm
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

	function err(campo: 'nombre' | 'direccion'): string | null {
		return errores[campo]?.[0] ?? null;
	}

	function handleTest() {
		if (!onTest) return;
		const datos = onTest();
		nombre = datos.nombre;
		direccion = datos.direccion ?? '';
		errores = {};
		errorGlobal = null;
	}

	async function handleEliminarClick() {
		if (!onEliminar) return;
		borrando = true;
		try {
			await onEliminar();
		} finally {
			borrando = false;
		}
	}
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	<TextField id="sede-nombre" label="Nombre" bind:value={nombre} error={err('nombre')} />
	<TextField
		id="sede-direccion"
		label="Dirección (opcional)"
		bind:value={direccion}
		error={err('direccion')}
	/>

	{#if errorGlobal}
		<div
			class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-400"
		>
			{errorGlobal}
		</div>
	{/if}

	<div class="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
		<div class="flex items-center gap-2">
			{#if onEliminar}
				<button
					type="button"
					onclick={handleEliminarClick}
					disabled={guardando || borrando}
					class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/40 sm:flex-none"
				>
					{#if borrando}<i class="bi bi-arrow-clockwise animate-spin"></i>
					{:else}<i class="bi bi-trash"></i>{/if}
					Eliminar
				</button>
			{/if}
			{#if onTest}
				<button
					type="button"
					onclick={handleTest}
					disabled={guardando || borrando}
					class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-400 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800 sm:flex-none"
				>
					<i class="bi bi-magic"></i>
					Test
				</button>
			{/if}
		</div>
		<div class="flex items-center gap-2 sm:gap-3">
			{#if onCancel}
				<button
					type="button"
					onclick={onCancel}
					disabled={guardando || borrando}
					class="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 sm:flex-none"
				>
					Cancelar
				</button>
			{/if}
			<button
				type="submit"
				disabled={guardando || borrando}
				class="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 sm:flex-none"
			>
				{#if guardando}<i class="bi bi-arrow-clockwise animate-spin"></i>{/if}
				{submitLabel}
			</button>
		</div>
	</div>
</form>
