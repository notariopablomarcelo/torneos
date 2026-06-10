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
	import TextField from './TextField.svelte';
	import SelectField from './SelectField.svelte';

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

	const seed = untrack(() => initial);
	let nivel = $state<NivelCategoria>(seed.nivel);
	let genero = $state<GeneroCategoria>(seed.genero);
	// El input numerico maneja null como "sin tope": guardamos string "" como
	// proxy y al validar lo convertimos a null | numero.
	let cuposStr = $state(seed.cupos === null ? '' : String(seed.cupos));
	// cantidadJugadores como string para el SelectField nativo (que devuelve
	// string al bindear). Lo convertimos a number al validar.
	let cantJugadoresStr = $state(String(seed.cantidadJugadores));

	// Opciones de tamano de equipo. Por ahora solo deportes individuales y de
	// pareja (padel, tenis singles/dobles). Cuando soportemos equipos mas
	// grandes (volley, futbol) sumamos mas opciones aca; el schema Zod ya
	// admite hasta 6.
	const TAMANOS = [
		{ value: '1', label: '1 (individual)' },
		{ value: '2', label: '2 (pareja)' }
	];

	const opcionesNivel = NIVELES_CATEGORIA.map((n) => ({ value: n, label: n }));
	const opcionesGenero = GENEROS_CATEGORIA.map((g) => ({ value: g, label: g }));

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
			cupos: cuposNorm,
			cantidadJugadores: Number(cantJugadoresStr)
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
		cantJugadoresStr = String(datos.cantidadJugadores);
		errores = {};
		errorGlobal = null;
	}
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<SelectField
			id="cat-nivel"
			label="Categoría"
			bind:value={nivel}
			options={opcionesNivel}
			error={err('nivel')}
		/>
		<SelectField
			id="cat-genero"
			label="Género"
			bind:value={genero}
			options={opcionesGenero}
			error={err('genero')}
		/>
	</div>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<TextField
			id="cat-cupos"
			label="Cupos (opcional)"
			type="text"
			inputmode="numeric"
			pattern="[0-9]*"
			bind:value={cuposStr}
			error={err('cupos')}
		/>
		<SelectField
			id="cat-tam"
			label="Jugadores por equipo"
			bind:value={cantJugadoresStr}
			options={TAMANOS}
			error={err('cantidadJugadores')}
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
