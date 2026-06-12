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
	import {
		totalParejasEnGrupos,
		totalZonasEnGrupos,
		type GrupoZonas
	} from '$lib/types/armado';
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

	// Modo personalizado: lista de grupos { cantidad, tamano, modalidad,
	// clasifican }. Si seed trae estructura personalizada, arrancamos en
	// modo custom; sino en simple. El toggle entre uno y otro preserva
	// los valores configurados de cada lado por si el user vuelve atras.
	let modoCustom = $state(
		!!seed.estructuraPersonalizada &&
			seed.estructuraPersonalizada.length > 0
	);
	let grupos = $state<GrupoZonas[]>(
		seed.estructuraPersonalizada && seed.estructuraPersonalizada.length > 0
			? seed.estructuraPersonalizada.map((g) => ({ ...g }))
			: [{ cantidad: 1, tamano: 4, modalidad: 'todosContraTodos', clasifican: 2 }]
	);

	const totalParejasGrupos = $derived(totalParejasEnGrupos(grupos));
	const totalZonasGrupos = $derived(totalZonasEnGrupos(grupos));
	const cuposNumPreview = $derived(
		cuposStr.trim() === '' ? null : Number(cuposStr)
	);
	const diferenciaCupos = $derived(
		cuposNumPreview === null ? null : totalParejasGrupos - cuposNumPreview
	);

	function agregarGrupo(): void {
		grupos = [
			...grupos,
			{ cantidad: 1, tamano: 3, modalidad: undefined, clasifican: 2 }
		];
	}
	function quitarGrupo(idx: number): void {
		grupos = grupos.filter((_, i) => i !== idx);
	}
	function setGrupo<K extends keyof GrupoZonas>(
		idx: number,
		campo: K,
		valor: GrupoZonas[K]
	): void {
		grupos = grupos.map((g, i) => {
			if (i !== idx) return g;
			const ng = { ...g, [campo]: valor };
			// Auto-correcciones: zona 3 no tiene modalidad; clasifican
			// capeado por tamano - 1.
			if (campo === 'tamano') {
				if (ng.tamano === 3) ng.modalidad = undefined;
				else if (ng.tamano === 4 && !ng.modalidad)
					ng.modalidad = 'todosContraTodos';
				const max = (ng.tamano - 1) as 2 | 3;
				if (ng.clasifican > max) ng.clasifican = max;
			}
			return ng;
		});
	}

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

		// Si esta modo custom y hay grupos validos, los persistimos. Sino
		// queda null (modo simple manda). Mantener ambos lados permite ir
		// y volver del toggle sin perder configuracion.
		const grupoNorm = modoCustom && grupos.length > 0 ? grupos : null;

		const parsed = categoriaInputSchema.safeParse({
			nivel,
			genero,
			cupos: cuposNorm,
			cantidadJugadores: Number(cantJugadoresStr),
			estructuraPersonalizada: grupoNorm,
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

			<!-- Toggle simple <-> custom. Cada lado conserva sus valores. -->
			<label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
				<input type="checkbox" bind:checked={modoCustom} class="accent-brand-500" />
				Configuración personalizada (grupos heterogéneos)
			</label>

			{#if !modoCustom}
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
			{:else}
				<!-- Editor de grupos: cada fila edita un grupo (cantidad, tamano,
				     modalidad si tamano=4, clasifican). -->
				<ul class="space-y-2">
					{#each grupos as g, i (i)}
						<li class="rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800/60">
							<div class="flex flex-wrap items-end gap-2 text-xs">
								<label class="flex flex-col gap-0.5">
									<span class="text-[10px] font-medium text-gray-500 dark:text-gray-400">
										Cant
									</span>
									<input
										type="number"
										min="1"
										max="64"
										value={g.cantidad}
										onchange={(e) =>
											setGrupo(i, 'cantidad', Math.max(1, Number(e.currentTarget.value) || 1))}
										class="w-16 rounded-md border border-gray-300 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
									/>
								</label>
								<label class="flex flex-col gap-0.5">
									<span class="text-[10px] font-medium text-gray-500 dark:text-gray-400">
										Tamaño
									</span>
									<select
										value={g.tamano}
										onchange={(e) =>
											setGrupo(i, 'tamano', Number(e.currentTarget.value) as 3 | 4)}
										class="rounded-md border border-gray-300 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
									>
										<option value={3}>3 (RR)</option>
										<option value={4}>4</option>
									</select>
								</label>
								{#if g.tamano === 4}
									<label class="flex flex-col gap-0.5">
										<span class="text-[10px] font-medium text-gray-500 dark:text-gray-400">
											Modalidad
										</span>
										<select
											value={g.modalidad ?? 'todosContraTodos'}
											onchange={(e) =>
												setGrupo(
													i,
													'modalidad',
													e.currentTarget.value as
														| 'todosContraTodos'
														| 'dobleOportunidad'
												)}
											class="rounded-md border border-gray-300 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
										>
											<option value="todosContraTodos">RR (6 part)</option>
											<option value="dobleOportunidad">DO (4 part)</option>
										</select>
									</label>
								{/if}
								<label class="flex flex-col gap-0.5">
									<span class="text-[10px] font-medium text-gray-500 dark:text-gray-400">
										Clasifican
									</span>
									<select
										value={g.clasifican}
										onchange={(e) =>
											setGrupo(i, 'clasifican', Number(e.currentTarget.value) as 1 | 2 | 3)}
										class="rounded-md border border-gray-300 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
									>
										<option value={1}>1</option>
										<option value={2}>2</option>
										{#if g.tamano === 4}
											<option value={3}>3</option>
										{/if}
									</select>
								</label>
								<button
									type="button"
									onclick={() => quitarGrupo(i)}
									disabled={grupos.length === 1}
									aria-label="Quitar grupo"
									class="ml-auto rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-900/40 dark:hover:text-red-400"
								>
									<i class="bi bi-x"></i>
								</button>
							</div>
							<p class="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
								{g.cantidad} {g.cantidad === 1 ? 'zona' : 'zonas'} de {g.tamano} = {g.cantidad *
									g.tamano} parejas
							</p>
						</li>
					{/each}
				</ul>

				<button
					type="button"
					onclick={agregarGrupo}
					class="inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
				>
					<i class="bi bi-plus-lg text-[10px]"></i>
					Agregar grupo
				</button>

				<!-- Resumen total: suma de parejas vs cupos. -->
				<div class="rounded-md bg-gray-100 px-3 py-2 text-xs dark:bg-gray-800">
					<p class="text-gray-700 dark:text-gray-300">
						Total: <strong>{totalZonasGrupos}</strong>
						{totalZonasGrupos === 1 ? 'zona' : 'zonas'} · <strong>{totalParejasGrupos}</strong>
						parejas
					</p>
					{#if cuposNumPreview !== null}
						<p
							class="mt-0.5 {diferenciaCupos === 0
								? 'text-emerald-700 dark:text-emerald-300'
								: 'text-amber-700 dark:text-amber-300'}"
						>
							Cupos: <strong>{cuposNumPreview}</strong>
							{#if diferenciaCupos === 0}
								<span>· coincide ✓</span>
							{:else if (diferenciaCupos ?? 0) > 0}
								<span>· sobran {diferenciaCupos} parejas en grupos</span>
							{:else}
								<span>· faltan {Math.abs(diferenciaCupos ?? 0)} parejas en grupos</span>
							{/if}
						</p>
					{/if}
				</div>
			{/if}
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
