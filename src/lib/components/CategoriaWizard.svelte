<script lang="ts">
	import { categoriaInputSchema, GENEROS_CATEGORIA, NIVELES_CATEGORIA, type CategoriaInput, type GeneroCategoria, type NivelCategoria } from '$lib/types/torneo';
	import { totalParejasEnGrupos, totalZonasEnGrupos, type GrupoZonas, type ModalidadZona4, type TamanoZona } from '$lib/types/armado';

	// Wizard de creacion de categoria. 5 steps base (Nivel, Genero, Cupos,
	// Jugadores, Estructura) + 1 condicional (sub-config si el organizador
	// eligio Misma config o Mezclar zonas distintas). El componente NO se
	// reusa para edicion — editar mantiene el form de pantalla unica.
	type Props = {
		onSubmit: (data: CategoriaInput) => Promise<void>;
		onCancel?: () => void;
		// onTest opcional: si esta presente, cada step muestra un boton "Test"
		// que rellena los campos restantes con datos ficticios y va al ultimo
		// step antes del submit.
		onTest?: () => CategoriaInput;
	};

	let { onSubmit, onCancel, onTest }: Props = $props();

	// ===== Estado del wizard =====

	let pasoActual = $state<number>(1);
	let guardando = $state(false);
	let errorGlobal = $state<string | null>(null);

	// Step 1
	let nivel = $state<NivelCategoria | null>(null);
	// Step 2
	let genero = $state<GeneroCategoria | null>(null);
	// Step 3 — cupos opcional. 'sin-definir' = el usuario eligio explicito
	// saltearlo; null = aun no decidido en el wizard.
	let cupos = $state<number | 'sin-definir' | null>(null);
	let cuposCustomStr = $state<string>('');
	let cuposEsCustom = $state(false);
	// Step 4 — jugadores por equipo. Solo 1 (singles) o 2 (pareja).
	let cantidadJugadores = $state<1 | 2 | null>(null);
	// Step 5 — modo de estructura.
	let modoEstructura = $state<'sin' | 'simple' | 'custom' | null>(null);
	// Step 6a (modo simple)
	let tamanoPreferido = $state<TamanoZona | null>(null);
	let modalidadZona4 = $state<ModalidadZona4 | null>(null);
	let clasificanPorZona = $state<1 | 2 | 3 | null>(null);
	// Step 6b (modo custom)
	let grupos = $state<GrupoZonas[]>([
		{ cantidad: 1, tamano: 4, modalidad: 'todosContraTodos', clasifican: 2 }
	]);

	// ===== Derivados =====

	// Total de steps efectivos. Por default 5; si el organizador eligio
	// "Misma config" o "Mezclar zonas distintas" suma el step 6 de config.
	const totalPasos = $derived(modoEstructura === 'sin' || modoEstructura === null ? 5 : 6);

	// Si la modalidad solo aplica a zonas de 4. En zonas de 3 forzamos null.
	const necesitaModalidad = $derived(tamanoPreferido === 4);

	// Sustantivo para el helper de cupos segun cantidadJugadores. Si no
	// elegido aun, "parejas" como default mas comun.
	const sustantivoCupo = $derived(
		cantidadJugadores === 1 ? 'jugadores' : 'parejas'
	);

	// Para Step 6 simple: validar que esten los 3 campos antes de habilitar
	// el submit.
	const simpleCompleto = $derived(
		tamanoPreferido !== null && clasificanPorZona !== null &&
			(tamanoPreferido === 3 || (tamanoPreferido === 4 && modalidadZona4 !== null))
	);

	// Para Step 6 custom: validar que haya al menos 1 grupo con cantidad > 0.
	const customCompleto = $derived(
		grupos.length > 0 && grupos.every((g) => g.cantidad > 0)
	);

	const totalParejasGrupos = $derived(totalParejasEnGrupos(grupos));
	const totalZonasGrupos = $derived(totalZonasEnGrupos(grupos));
	const cuposNumero = $derived(typeof cupos === 'number' ? cupos : null);
	const diferenciaCupos = $derived(
		cuposNumero === null ? null : totalParejasGrupos - cuposNumero
	);

	// ===== Helpers =====

	function pasoAtras() {
		if (pasoActual === 1) {
			onCancel?.();
			return;
		}
		// Si estoy en step 6 y vuelvo, voy a step 5 y limpio la decision para
		// que el usuario pueda elegir otra estructura.
		if (pasoActual === 6) {
			pasoActual = 5;
			modoEstructura = null;
			return;
		}
		pasoActual -= 1;
	}

	function elegirNivel(n: NivelCategoria) {
		nivel = n;
		pasoActual = 2;
	}

	function elegirGenero(g: GeneroCategoria) {
		genero = g;
		pasoActual = 3;
	}

	function elegirCupoChip(c: number | 'sin-definir') {
		cupos = c;
		cuposEsCustom = false;
		cuposCustomStr = '';
		pasoActual = 4;
	}

	function activarCuposCustom() {
		cuposEsCustom = true;
		cupos = null;
		cuposCustomStr = '';
	}

	function confirmarCuposCustom() {
		const n = Number(cuposCustomStr);
		if (!Number.isInteger(n) || n <= 0) {
			errorGlobal = 'Ingresá un número entero mayor a 0.';
			return;
		}
		cupos = n;
		errorGlobal = null;
		pasoActual = 4;
	}

	function elegirJugadores(c: 1 | 2) {
		cantidadJugadores = c;
		pasoActual = 5;
	}

	async function elegirEstructura(modo: 'sin' | 'simple' | 'custom') {
		modoEstructura = modo;
		if (modo === 'sin') {
			await submitFinal();
		} else {
			pasoActual = 6;
		}
	}

	async function submitFinal() {
		errorGlobal = null;
		if (!nivel || !genero || !cantidadJugadores) {
			errorGlobal = 'Faltan campos obligatorios.';
			return;
		}
		const cuposEfectivos =
			typeof cupos === 'number' ? cupos : null;
		const estructuraPersonalizada =
			modoEstructura === 'custom' ? grupos.map((g) => ({ ...g })) : null;
		const input = {
			nivel,
			genero,
			cupos: cuposEfectivos,
			cantidadJugadores,
			tamanoPreferido: modoEstructura === 'simple' ? tamanoPreferido : null,
			modalidadZona4:
				modoEstructura === 'simple' && tamanoPreferido === 4
					? modalidadZona4
					: null,
			clasificanPorZona: modoEstructura === 'simple' ? clasificanPorZona : null,
			estructuraPersonalizada
		};
		const parsed = categoriaInputSchema.safeParse(input);
		if (!parsed.success) {
			const fst = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
			errorGlobal = fst ?? 'Datos invalidos.';
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

	function handleTest() {
		if (!onTest) return;
		const datos = onTest();
		nivel = datos.nivel;
		genero = datos.genero;
		cupos = datos.cupos;
		cuposEsCustom = false;
		cuposCustomStr = datos.cupos === null ? '' : String(datos.cupos);
		cantidadJugadores = datos.cantidadJugadores === 1 ? 1 : 2;
		if (datos.estructuraPersonalizada && datos.estructuraPersonalizada.length > 0) {
			modoEstructura = 'custom';
			grupos = datos.estructuraPersonalizada.map((g) => ({ ...g }));
		} else if (datos.tamanoPreferido && datos.clasificanPorZona) {
			modoEstructura = 'simple';
			tamanoPreferido = datos.tamanoPreferido;
			modalidadZona4 = datos.modalidadZona4 ?? null;
			clasificanPorZona = datos.clasificanPorZona;
		} else {
			modoEstructura = 'sin';
		}
		// Si test, vamos al ultimo paso visible.
		pasoActual = totalPasos;
	}

	// Cupos sugeridos por defecto: 3..16, despues 18, 20, 22, 24.
	const CUPOS_SUGERIDOS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24];

	function agregarGrupo() {
		grupos = [
			...grupos,
			{ cantidad: 1, tamano: 3, modalidad: undefined, clasifican: 2 }
		];
	}
	function quitarGrupo(idx: number) {
		grupos = grupos.filter((_, i) => i !== idx);
	}
	function setGrupo<K extends keyof GrupoZonas>(
		idx: number,
		campo: K,
		valor: GrupoZonas[K]
	) {
		grupos = grupos.map((g, i) => {
			if (i !== idx) return g;
			const nuevo = { ...g, [campo]: valor };
			if (campo === 'tamano') {
				if (valor === 3) {
					nuevo.modalidad = undefined;
					if ((nuevo.clasifican ?? 1) > 2) nuevo.clasifican = 2;
				} else if (valor === 4 && !nuevo.modalidad) {
					nuevo.modalidad = 'todosContraTodos';
				}
			}
			return nuevo;
		});
	}
</script>

<div class="space-y-5">
	<!-- Stepper compacto: muestra todos los pasos como circulos numerados. -->
	<div class="flex items-center justify-center gap-1.5">
		{#each Array(totalPasos) as _, i (i)}
			{@const num = i + 1}
			{@const completado = num < pasoActual}
			{@const activo = num === pasoActual}
			<div
				class="flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold transition {activo
					? 'bg-brand-500 text-white'
					: completado
						? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
						: 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}"
			>
				{num}
			</div>
			{#if num < totalPasos}
				<div
					class="h-px w-3 {completado ? 'bg-brand-300 dark:bg-brand-700' : 'bg-gray-200 dark:bg-gray-700'}"
				></div>
			{/if}
		{/each}
	</div>

	{#if errorGlobal}
		<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-400">
			{errorGlobal}
		</div>
	{/if}

	<!-- Step 1 — Nivel -->
	{#if pasoActual === 1}
		<header>
			<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">¿Qué nivel?</h2>
			<p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
				Elegí la categoría del torneo.
			</p>
		</header>
		<div class="grid grid-cols-3 gap-2">
			{#each NIVELES_CATEGORIA as n (n)}
				<button
					type="button"
					onclick={() => elegirNivel(n)}
					class="rounded-lg border-2 border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-700 transition hover:border-brand-400 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-brand-500 dark:hover:bg-brand-900/30"
				>
					{n}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Step 2 — Genero -->
	{#if pasoActual === 2}
		<header>
			<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">¿Género?</h2>
			<p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
				Categoría: <strong>{nivel}</strong>
			</p>
		</header>
		<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
			{#each GENEROS_CATEGORIA as g (g)}
				<button
					type="button"
					onclick={() => elegirGenero(g)}
					class="rounded-lg border-2 border-gray-200 bg-white px-4 py-4 text-base font-semibold text-gray-700 transition hover:border-brand-400 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-brand-500 dark:hover:bg-brand-900/30"
				>
					{g}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Step 3 — Cupos -->
	{#if pasoActual === 3}
		<header>
			<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">¿Cuántos cupos?</h2>
			<p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
				Cantidad máxima de {sustantivoCupo}. Podés dejarlo sin definir.
			</p>
		</header>
		{#if !cuposEsCustom}
			<div class="grid grid-cols-4 gap-2 sm:grid-cols-5">
				<button
					type="button"
					onclick={() => elegirCupoChip('sin-definir')}
					class="col-span-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-xs font-medium text-gray-600 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-brand-500 dark:hover:bg-brand-900/30"
				>
					Sin definir
				</button>
				{#each CUPOS_SUGERIDOS as c (c)}
					<button
						type="button"
						onclick={() => elegirCupoChip(c)}
						class="rounded-lg border-2 border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-700 transition hover:border-brand-400 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-brand-500 dark:hover:bg-brand-900/30"
					>
						{c}
					</button>
				{/each}
				<button
					type="button"
					onclick={activarCuposCustom}
					class="col-span-2 rounded-lg border-2 border-gray-200 bg-white px-3 py-3 text-xs font-medium text-gray-600 transition hover:border-brand-400 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-brand-500 dark:hover:bg-brand-900/30"
				>
					Otro número…
				</button>
			</div>
		{:else}
			<div class="space-y-3">
				<label for="cupos-custom" class="block text-xs font-medium text-gray-600 dark:text-gray-400">
					Escribí la cantidad de {sustantivoCupo}
				</label>
				<input
					id="cupos-custom"
					type="number"
					inputmode="numeric"
					min="1"
					bind:value={cuposCustomStr}
					placeholder="Ej: 32"
					class="w-full rounded-lg border-2 border-gray-300 bg-white px-3 py-3 text-lg font-semibold text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
				/>
				<div class="flex gap-2">
					<button
						type="button"
						onclick={() => (cuposEsCustom = false)}
						class="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
					>
						Volver a los sugeridos
					</button>
					<button
						type="button"
						onclick={confirmarCuposCustom}
						class="flex-1 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
					>
						Continuar
					</button>
				</div>
			</div>
		{/if}
	{/if}

	<!-- Step 4 — Jugadores por equipo -->
	{#if pasoActual === 4}
		<header>
			<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">¿Pareja o singles?</h2>
			<p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
				Jugadores por equipo.
			</p>
		</header>
		<div class="grid grid-cols-2 gap-3">
			<button
				type="button"
				onclick={() => elegirJugadores(2)}
				class="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-gray-200 bg-white px-3 py-6 text-center transition hover:border-brand-400 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-brand-500 dark:hover:bg-brand-900/30"
			>
				<i class="bi bi-people text-3xl text-brand-500"></i>
				<span class="text-base font-semibold text-gray-900 dark:text-gray-100">Pareja</span>
				<span class="text-xs text-gray-500 dark:text-gray-400">2 jugadores por equipo</span>
			</button>
			<button
				type="button"
				onclick={() => elegirJugadores(1)}
				class="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-gray-200 bg-white px-3 py-6 text-center transition hover:border-brand-400 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-brand-500 dark:hover:bg-brand-900/30"
			>
				<i class="bi bi-person text-3xl text-brand-500"></i>
				<span class="text-base font-semibold text-gray-900 dark:text-gray-100">Singles</span>
				<span class="text-xs text-gray-500 dark:text-gray-400">1 jugador por equipo</span>
			</button>
		</div>
	{/if}

	<!-- Step 5 — Estructura (3 cards) -->
	{#if pasoActual === 5}
		<header>
			<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">¿Cómo van a ser las zonas?</h2>
			<p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
				Podés definirlo ahora o después al armar las zonas — es lo mismo.
			</p>
		</header>
		<div class="space-y-2">
			<button
				type="button"
				onclick={() => elegirEstructura('sin')}
				disabled={guardando}
				class="flex w-full items-center gap-4 rounded-xl border-2 border-gray-200 bg-white p-4 text-left transition hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-brand-500 dark:hover:bg-brand-900/30"
			>
				<span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
					<i class="bi bi-skip-forward"></i>
				</span>
				<div class="flex-1">
					<p class="text-sm font-semibold text-gray-900 dark:text-gray-100">Decidir al armar las zonas</p>
					<p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
						Creás la categoría ahora y elegís la estructura más tarde.
					</p>
				</div>
				{#if guardando}
					<i class="bi bi-arrow-clockwise animate-spin text-gray-400"></i>
				{:else}
					<i class="bi bi-chevron-right text-gray-300 dark:text-gray-600"></i>
				{/if}
			</button>
			<button
				type="button"
				onclick={() => elegirEstructura('simple')}
				class="flex w-full items-center gap-4 rounded-xl border-2 border-gray-200 bg-white p-4 text-left transition hover:border-brand-400 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-brand-500 dark:hover:bg-brand-900/30"
			>
				<span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
					<i class="bi bi-diagram-3"></i>
				</span>
				<div class="flex-1">
					<p class="text-sm font-semibold text-gray-900 dark:text-gray-100">Misma config para todas las zonas</p>
					<p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
						Un tamaño, una modalidad, mismo clasifican.
					</p>
				</div>
				<i class="bi bi-chevron-right text-gray-300 dark:text-gray-600"></i>
			</button>
			<button
				type="button"
				onclick={() => elegirEstructura('custom')}
				class="flex w-full items-center gap-4 rounded-xl border-2 border-gray-200 bg-white p-4 text-left transition hover:border-brand-400 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-brand-500 dark:hover:bg-brand-900/30"
			>
				<span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
					<i class="bi bi-grid-3x3-gap"></i>
				</span>
				<div class="flex-1">
					<div class="flex items-center gap-2">
						<p class="text-sm font-semibold text-gray-900 dark:text-gray-100">Mezclar zonas distintas</p>
						<span class="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
							avanzado
						</span>
					</div>
					<p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
						Combinar zonas de tamaños o modalidades distintas.
					</p>
				</div>
				<i class="bi bi-chevron-right text-gray-300 dark:text-gray-600"></i>
			</button>
		</div>
	{/if}

	<!-- Step 6a — Misma config (modo simple) -->
	{#if pasoActual === 6 && modoEstructura === 'simple'}
		<header>
			<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Misma config</h2>
			<p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
				Estos valores se aplican a todas las zonas.
			</p>
		</header>
		<div class="space-y-4">
			<div>
				<p class="mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">Tamaño de cada zona</p>
				<div class="grid grid-cols-2 gap-2">
					<button
						type="button"
						onclick={() => {
							tamanoPreferido = 3;
							modalidadZona4 = null;
							if ((clasificanPorZona ?? 1) > 2) clasificanPorZona = 2;
						}}
						class="rounded-lg border-2 px-4 py-3 text-sm font-semibold transition {tamanoPreferido ===
						3
							? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
							: 'border-gray-200 bg-white text-gray-700 hover:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}"
					>
						Zonas de 3
					</button>
					<button
						type="button"
						onclick={() => {
							tamanoPreferido = 4;
							if (!modalidadZona4) modalidadZona4 = 'todosContraTodos';
						}}
						class="rounded-lg border-2 px-4 py-3 text-sm font-semibold transition {tamanoPreferido ===
						4
							? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
							: 'border-gray-200 bg-white text-gray-700 hover:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}"
					>
						Zonas de 4
					</button>
				</div>
			</div>

			{#if necesitaModalidad}
				<div>
					<p class="mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">Modalidad de cada zona</p>
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
						<button
							type="button"
							onclick={() => (modalidadZona4 = 'todosContraTodos')}
							class="rounded-lg border-2 px-3 py-2.5 text-xs font-semibold transition {modalidadZona4 ===
							'todosContraTodos'
								? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
								: 'border-gray-200 bg-white text-gray-700 hover:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}"
						>
							Todos contra todos
							<span class="block text-[10px] font-normal opacity-70">6 partidos</span>
						</button>
						<button
							type="button"
							onclick={() => (modalidadZona4 = 'dobleOportunidad')}
							class="rounded-lg border-2 px-3 py-2.5 text-xs font-semibold transition {modalidadZona4 ===
							'dobleOportunidad'
								? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
								: 'border-gray-200 bg-white text-gray-700 hover:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}"
						>
							Doble oportunidad
							<span class="block text-[10px] font-normal opacity-70">4 partidos</span>
						</button>
					</div>
				</div>
			{/if}

			<div>
				<p class="mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">Clasifican por zona</p>
				<div class="grid grid-cols-3 gap-2">
					<button
						type="button"
						onclick={() => (clasificanPorZona = 1)}
						class="rounded-lg border-2 px-3 py-2.5 text-sm font-semibold transition {clasificanPorZona ===
						1
							? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
							: 'border-gray-200 bg-white text-gray-700 hover:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}"
					>
						1
					</button>
					<button
						type="button"
						onclick={() => (clasificanPorZona = 2)}
						class="rounded-lg border-2 px-3 py-2.5 text-sm font-semibold transition {clasificanPorZona ===
						2
							? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
							: 'border-gray-200 bg-white text-gray-700 hover:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}"
					>
						2
					</button>
					<button
						type="button"
						onclick={() => (clasificanPorZona = 3)}
						disabled={tamanoPreferido !== 4}
						title={tamanoPreferido !== 4 ? 'Solo en zonas de 4' : ''}
						class="rounded-lg border-2 px-3 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 {clasificanPorZona ===
						3
							? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
							: 'border-gray-200 bg-white text-gray-700 hover:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}"
					>
						3
					</button>
				</div>
			</div>

			<button
				type="button"
				onclick={submitFinal}
				disabled={!simpleCompleto || guardando}
				class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if guardando}
					<i class="bi bi-arrow-clockwise animate-spin"></i>
				{:else}
					<i class="bi bi-check2"></i>
				{/if}
				Crear categoría
			</button>
		</div>
	{/if}

	<!-- Step 6b — Mezclar zonas distintas (modo custom) -->
	{#if pasoActual === 6 && modoEstructura === 'custom'}
		<header>
			<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Mezcla de zonas</h2>
			<p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
				Definí cuántos grupos de zonas y la config de cada grupo.
			</p>
		</header>
		<div class="space-y-3">
			{#each grupos as g, idx (idx)}
				<div class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
					<div class="mb-2 flex items-center justify-between">
						<p class="text-xs font-semibold text-gray-700 dark:text-gray-300">Grupo {idx + 1}</p>
						<button
							type="button"
							onclick={() => quitarGrupo(idx)}
							disabled={grupos.length === 1}
							aria-label="Quitar grupo"
							class="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-red-900/40 dark:hover:text-red-400"
						>
							<i class="bi bi-x"></i>
						</button>
					</div>
					<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
						<label class="block">
							<span class="block text-[10px] font-medium text-gray-500 uppercase">Cant.</span>
							<input
								type="number"
								min="1"
								max="64"
								value={g.cantidad}
								oninput={(e) => setGrupo(idx, 'cantidad', Math.max(1, Number(e.currentTarget.value) || 1))}
								class="mt-0.5 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
							/>
						</label>
						<label class="block">
							<span class="block text-[10px] font-medium text-gray-500 uppercase">Tamaño</span>
							<select
								value={g.tamano}
								onchange={(e) => setGrupo(idx, 'tamano', Number(e.currentTarget.value) as 3 | 4)}
								class="mt-0.5 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
							>
								<option value={3}>3 parejas</option>
								<option value={4}>4 parejas</option>
							</select>
						</label>
						{#if g.tamano === 4}
							<label class="block">
								<span class="block text-[10px] font-medium text-gray-500 uppercase">Modalidad</span>
								<select
									value={g.modalidad ?? 'todosContraTodos'}
									onchange={(e) => setGrupo(idx, 'modalidad', e.currentTarget.value as ModalidadZona4)}
									class="mt-0.5 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
								>
									<option value="todosContraTodos">RR (6 part)</option>
									<option value="dobleOportunidad">DO (4 part)</option>
								</select>
							</label>
						{:else}
							<div class="text-[10px] italic text-gray-400 self-center">RR</div>
						{/if}
						<label class="block">
							<span class="block text-[10px] font-medium text-gray-500 uppercase">Clasifican</span>
							<select
								value={g.clasifican}
								onchange={(e) => setGrupo(idx, 'clasifican', Number(e.currentTarget.value) as 1 | 2 | 3)}
								class="mt-0.5 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
							>
								<option value={1}>1</option>
								<option value={2}>2</option>
								{#if g.tamano === 4}
									<option value={3}>3</option>
								{/if}
							</select>
						</label>
					</div>
				</div>
			{/each}
			<button
				type="button"
				onclick={agregarGrupo}
				class="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 bg-white px-3 py-2.5 text-xs font-medium text-gray-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-brand-500 dark:hover:bg-brand-900/30"
			>
				<i class="bi bi-plus-lg"></i>
				Agregar grupo
			</button>

			<!-- Resumen vivo. -->
			<div class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-800/50">
				<p class="font-semibold text-gray-700 dark:text-gray-300">
					Total: {totalZonasGrupos} {totalZonasGrupos === 1 ? 'zona' : 'zonas'} · {totalParejasGrupos}
					{sustantivoCupo}
				</p>
				{#if diferenciaCupos !== null && cuposNumero !== null}
					{#if diferenciaCupos === 0}
						<p class="mt-0.5 text-emerald-700 dark:text-emerald-300">Coincide con los cupos.</p>
					{:else if diferenciaCupos > 0}
						<p class="mt-0.5 text-amber-700 dark:text-amber-300">
							Sobran {diferenciaCupos} ({cuposNumero} cupos).
						</p>
					{:else}
						<p class="mt-0.5 text-amber-700 dark:text-amber-300">
							Faltan {Math.abs(diferenciaCupos)} ({cuposNumero} cupos).
						</p>
					{/if}
				{/if}
			</div>

			<button
				type="button"
				onclick={submitFinal}
				disabled={!customCompleto || guardando}
				class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if guardando}
					<i class="bi bi-arrow-clockwise animate-spin"></i>
				{:else}
					<i class="bi bi-check2"></i>
				{/if}
				Crear categoría
			</button>
		</div>
	{/if}

	<!-- Footer: Atras y Test (si dev). -->
	<div class="flex items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-gray-800">
		<button
			type="button"
			onclick={pasoAtras}
			disabled={guardando}
			class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800"
		>
			<i class="bi bi-arrow-left"></i>
			{pasoActual === 1 ? 'Cancelar' : 'Atrás'}
		</button>
		{#if onTest}
			<button
				type="button"
				onclick={handleTest}
				disabled={guardando}
				title="Rellenar con datos de prueba (solo dev)"
				class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
			>
				<i class="bi bi-magic"></i>
				Test
			</button>
		{/if}
	</div>
</div>
