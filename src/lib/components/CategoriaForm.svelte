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

	// Estructura preferida (opcional). Strings vacios = "sin definir". Solo
	// se persisten cuando tienen valor. La modalidad solo aplica a zonas de
	// 4 (zonas de 3 son siempre round-robin); si tamano = 3 la limpiamos
	// antes de guardar.
	let tamanoStr = $state<string>(
		seed.tamanoPreferido ? String(seed.tamanoPreferido) : ''
	);
	let modalidadStr = $state<string>(seed.modalidadZona4 ?? '');
	let clasificanStr = $state<string>(
		seed.clasificanPorZona ? String(seed.clasificanPorZona) : ''
	);

	// Opciones para los selects de estructura.
	const TAMANO_OPCIONES = [
		{ value: '', label: 'Sin definir' },
		{ value: '3', label: 'Zonas de 3' },
		{ value: '4', label: 'Zonas de 4' }
	];
	const MODALIDAD_OPCIONES = [
		{ value: '', label: 'Sin definir' },
		{ value: 'todosContraTodos', label: 'Todos contra todos (6 partidos)' },
		{ value: 'dobleOportunidad', label: 'Doble oportunidad (4 partidos)' }
	];
	// El maximo de clasifican depende del tamano: zona de 3 admite hasta 2,
	// zona de 4 admite hasta 3.
	const opcionesClasifican = $derived.by<{ value: string; label: string }[]>(
		() => {
			const max = tamanoStr === '4' ? 3 : 2;
			const out: { value: string; label: string }[] = [
				{ value: '', label: 'Sin definir' }
			];
			for (let i = 1; i <= max; i += 1) {
				out.push({ value: String(i), label: `${i} por zona` });
			}
			return out;
		}
	);

	// Auto-ajuste: si pasamos de zona 4 a zona 3, modalidad no aplica.
	$effect(() => {
		if (tamanoStr !== '4' && modalidadStr !== '') {
			modalidadStr = '';
		}
		// Si clasifican = 3 pero tamano = 3 (max 2), bajar a 2.
		if (tamanoStr === '3' && clasificanStr === '3') {
			clasificanStr = '2';
		}
	});

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

		// Estructura preferida: strings vacios = null (sin preferencia).
		const tamanoNum =
			tamanoStr === '3' ? 3 : tamanoStr === '4' ? 4 : null;
		const modalidadNorm =
			tamanoNum === 4 && modalidadStr !== '' ? modalidadStr : null;
		const clasificanNum =
			clasificanStr === '1'
				? 1
				: clasificanStr === '2'
					? 2
					: clasificanStr === '3'
						? 3
						: null;

		const parsed = categoriaInputSchema.safeParse({
			nivel,
			genero,
			cupos: cuposNorm,
			cantidadJugadores: Number(cantJugadoresStr),
			tamanoPreferido: tamanoNum,
			modalidadZona4: modalidadNorm,
			clasificanPorZona: clasificanNum
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
		tamanoStr = datos.tamanoPreferido ? String(datos.tamanoPreferido) : '';
		modalidadStr = datos.modalidadZona4 ?? '';
		clasificanStr = datos.clasificanPorZona
			? String(datos.clasificanPorZona)
			: '';
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

	<!-- Estructura preferida (opcional). Sirve para estimar partidos antes de
	     tener inscripciones y como default cuando se arman las zonas. Se
	     puede dejar sin definir y elegir al armar. -->
	<details class="rounded-lg border border-gray-200 dark:border-gray-800">
		<summary class="cursor-pointer px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
			Estructura preferida (opcional)
		</summary>
		<div class="space-y-3 border-t border-gray-100 p-3 dark:border-gray-800">
			<p class="text-xs text-gray-500 dark:text-gray-400">
				Si la cargás ahora podemos estimar la cantidad de partidos. Igual
				vas a poder cambiarla al armar las zonas.
			</p>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<SelectField
					id="cat-tamano-zona"
					label="Tamaño preferido de zonas"
					bind:value={tamanoStr}
					options={TAMANO_OPCIONES}
				/>
				{#if tamanoStr === '4'}
					<SelectField
						id="cat-modalidad"
						label="Modalidad zonas de 4"
						bind:value={modalidadStr}
						options={MODALIDAD_OPCIONES}
					/>
				{/if}
				<SelectField
					id="cat-clasifican"
					label="Clasifican por zona"
					bind:value={clasificanStr}
					options={opcionesClasifican}
				/>
			</div>
		</div>
	</details>

	{#if errorGlobal}
		<div class="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/40 p-3 text-sm text-red-700 dark:text-red-400">
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
					class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-400 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
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
					class="rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
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
