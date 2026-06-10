<script lang="ts">
	import { untrack } from 'svelte';
	import {
		categoriaInputSchema,
		GENEROS_CATEGORIA,
		NIVELES_CATEGORIA,
		type CategoriaInput,
		type GeneroCategoria,
		type NivelCategoria
	} from '$lib/types/torneo';

	type Props = {
		initial: CategoriaInput;
		submitLabel?: string;
		onSubmit: (data: CategoriaInput) => Promise<void>;
		onCancel?: () => void;
		// onTest opcional: si esta presente, el form muestra un boton "Test"
		// que rellena los campos con datos ficticios. El padre decide cuando
		// pasarlo (tipicamente solo fuera de produccion).
		onTest?: () => CategoriaInput;
	};

	let { initial, submitLabel = 'Guardar', onSubmit, onCancel, onTest }: Props = $props();

	// El form solo toma initial como valores iniciales; cambios posteriores
	// del padre no se reflejan (es por diseño). untrack rompe el rastreo
	// para que Svelte no se queje de capturar un reactivo en $state.
	const seed = untrack(() => initial);
	let nivel = $state<NivelCategoria>(seed.nivel);
	let genero = $state<GeneroCategoria>(seed.genero);
	// El input numerico maneja null como "sin tope": guardamos string "" como
	// proxy y al validar lo convertimos a null | numero.
	let cuposStr = $state(seed.cupos === null ? '' : String(seed.cupos));

	let errores = $state<Record<string, string[] | undefined>>({});
	let errorGlobal = $state<string | null>(null);
	let guardando = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		errores = {};
		errorGlobal = null;

		const cuposNorm = cuposStr.trim() === '' ? null : Number(cuposStr);

		const parsed = categoriaInputSchema.safeParse({
			nivel,
			genero,
			cupos: cuposNorm
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

	function err(campo: keyof CategoriaInput): string | null {
		return errores[campo]?.[0] ?? null;
	}

	function handleTest() {
		if (!onTest) return;
		const datos = onTest();
		nivel = datos.nivel;
		genero = datos.genero;
		cuposStr = datos.cupos === null ? '' : String(datos.cupos);
		errores = {};
		errorGlobal = null;
	}
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<div>
			<label for="cat-nivel" class="mb-1 block text-sm font-medium text-gray-700">
				Categoría
			</label>
			<select
				id="cat-nivel"
				bind:value={nivel}
				class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
			>
				{#each NIVELES_CATEGORIA as n (n)}
					<option value={n}>{n}</option>
				{/each}
			</select>
			{#if err('nivel')}
				<p class="mt-1 text-xs text-red-600">{err('nivel')}</p>
			{/if}
		</div>
		<div>
			<label for="cat-genero" class="mb-1 block text-sm font-medium text-gray-700">
				Género
			</label>
			<select
				id="cat-genero"
				bind:value={genero}
				class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
			>
				{#each GENEROS_CATEGORIA as g (g)}
					<option value={g}>{g}</option>
				{/each}
			</select>
			{#if err('genero')}
				<p class="mt-1 text-xs text-red-600">{err('genero')}</p>
			{/if}
		</div>
	</div>

	<div>
		<label for="cat-cupos" class="mb-1 block text-sm font-medium text-gray-700">
			Cupos <span class="text-xs text-gray-400">(vacío = sin tope)</span>
		</label>
		<input
			id="cat-cupos"
			type="text"
			inputmode="numeric"
			pattern="[0-9]*"
			bind:value={cuposStr}
			class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
			placeholder="32"
		/>
		{#if err('cupos')}
			<p class="mt-1 text-xs text-red-600">{err('cupos')}</p>
		{/if}
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
