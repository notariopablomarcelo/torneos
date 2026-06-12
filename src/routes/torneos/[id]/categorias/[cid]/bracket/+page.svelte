<script lang="ts">
	import { page } from '$app/state';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import BreadcrumbCard from '$lib/components/BreadcrumbCard.svelte';
	import KebabMenu from '$lib/components/KebabMenu.svelte';
	import ResultadoForm from '$lib/components/ResultadoForm.svelte';
	import { suscribirTorneo } from '$lib/services/torneos';
	import { obtenerCategoria } from '$lib/services/categorias';
	import { suscribirJugadores } from '$lib/services/jugadores';
	import { suscribirInscripciones } from '$lib/services/inscripciones';
	import {
		borrarResultadoPartido,
		cargarResultadoPartido,
		suscribirPartidos,
		suscribirZonas
	} from '$lib/services/armado';
	import {
		armarBracketCategoria,
		desarmarBracketCategoria,
		resolverParejaRefBracket
	} from '$lib/services/bracket';
	import { calcularTablaPosiciones, estadoZona } from '$lib/zonas/resultados';
	import { AMBIENTE } from '$lib/firebase';
	import { generarResultadoPartido } from '$lib/dev/factories';
	import {
		nombreCategoria,
		type Categoria,
		type Torneo
	} from '$lib/types/torneo';
	import { generarPreviewEstructura } from '$lib/preview/estructura';
	import {
		nombreInscripcion,
		nombresJugadores,
		type Inscripcion
	} from '$lib/types/inscripcion';
	import type {
		ParejaRef,
		Partido,
		ResultadoPartido,
		Zona
	} from '$lib/types/armado';
	import type { Jugador } from '$lib/types/jugador';

	const tid = $derived(page.params.id as string);
	const cid = $derived(page.params.cid as string);

	let torneo = $state<Torneo | null>(null);
	let categoria = $state<Categoria | null>(null);
	let inscripciones = $state<Inscripcion[]>([]);
	let jugadores = $state<Jugador[]>([]);
	let zonas = $state<Zona[]>([]);
	let partidos = $state<Partido[]>([]);
	let cargandoCategoria = $state(true);
	let cargandoJugadores = $state(true);
	let errorCarga = $state<string | null>(null);

	const cargando = $derived(cargandoCategoria || cargandoJugadores);

	const jugadoresPorId = $derived(new Map(jugadores.map((j) => [j.id, j])));
	const inscripcionesPorId = $derived(
		new Map(inscripciones.map((i) => [i.id, i]))
	);

	const onTestResultado =
		AMBIENTE !== 'prod' ? generarResultadoPartido : undefined;

	$effect(() => {
		const t = tid;
		const c = cid;
		cargandoCategoria = true;
		cargandoJugadores = true;
		errorCarga = null;
		torneo = null;
		categoria = null;
		inscripciones = [];
		zonas = [];
		partidos = [];

		let cancelado = false;
		const unsubT = suscribirTorneo(t, (val) => {
			torneo = val;
		});
		const unsubI = suscribirInscripciones(t, c, (val) => {
			inscripciones = val;
		});
		const unsubJ = suscribirJugadores((val) => {
			jugadores = val;
			cargandoJugadores = false;
		});
		const unsubZ = suscribirZonas(t, c, (val) => {
			zonas = val;
		});
		const unsubP = suscribirPartidos(t, c, (val) => {
			partidos = val;
		});
		(async () => {
			try {
				const cat = await obtenerCategoria(t, c);
				if (cancelado) return;
				categoria = cat;
				if (!cat) errorCarga = 'No se encontró la categoría.';
			} catch (err) {
				if (cancelado) return;
				errorCarga = err instanceof Error ? err.message : 'Error al cargar.';
			} finally {
				if (!cancelado) cargandoCategoria = false;
			}
		})();
		return () => {
			cancelado = true;
			unsubT();
			unsubI();
			unsubJ();
			unsubZ();
			unsubP();
		};
	});

	// Estado del modulo:
	// - zonas no armadas → mensaje.
	// - bracket no armado pero hay zonas → revisar si todas estan finalizadas.
	// - bracket armado → mostrar partidos.
	const zonasArmadas = $derived(zonas.length > 0);

	// Preview del cuadro final con parejas genericas, cuando NO esta armado
	// pero la categoria tiene estructura preferida + cupos definidos.
	const previewBracket = $derived.by(() => {
		if (zonasArmadas) return null;
		if (!categoria?.cupos) return null;
		if (!categoria.tamanoPreferido || !categoria.clasificanPorZona) return null;
		const modalidad =
			categoria.tamanoPreferido === 4
				? (categoria.modalidadZona4 ?? 'todosContraTodos')
				: 'todosContraTodos';
		const est = generarPreviewEstructura(
			categoria.cupos,
			categoria.tamanoPreferido,
			modalidad,
			categoria.clasificanPorZona
		);
		return est && est.bracket.length > 0 ? est : null;
	});
	const bracketArmado = $derived((categoria?.bracketConfig ?? null) !== null);

	// Partidos de zonas para usar en estadoZona.
	const partidosZonas = $derived(partidos.filter((p) => p.zonaId !== null));

	const todasZonasFinalizadas = $derived.by(() => {
		if (zonas.length === 0) return false;
		return zonas.every((z) => estadoZona(z, partidosZonas) === 'Finalizada');
	});

	const zonasPendientes = $derived(
		zonas.filter((z) => estadoZona(z, partidosZonas) !== 'Finalizada')
	);

	// Partidos del bracket: zonaId === null.
	const partidosBracket = $derived(
		[...partidos]
			.filter((p) => p.zonaId === null)
			.sort((a, b) => {
				if ((a.ronda ?? 0) !== (b.ronda ?? 0))
					return (a.ronda ?? 0) - (b.ronda ?? 0);
				return (a.posicionEnRonda ?? 0) - (b.posicionEnRonda ?? 0);
			})
	);

	// Agrupar partidos del bracket por ronda.
	type RondaGrupo = {
		ronda: number;
		fase: string;
		partidos: Partido[];
	};

	const rondas = $derived.by<RondaGrupo[]>(() => {
		const map = new Map<number, Partido[]>();
		for (const p of partidosBracket) {
			const r = p.ronda ?? 0;
			const arr = map.get(r) ?? [];
			arr.push(p);
			map.set(r, arr);
		}
		return Array.from(map.entries())
			.sort((a, b) => a[0] - b[0])
			.map(([ronda, partidos]) => ({
				ronda,
				fase: partidos[0]?.fase ?? '',
				partidos
			}));
	});

	// Modo de visualizacion: 'lista' (tabs por ronda, una ronda a la vez)
	// o 'cuadro' (estilo Roland Garros, todas las rondas en columnas con
	// scroll horizontal).
	let vistaCuadro = $state<'lista' | 'cuadro'>('lista');

	// Ronda activa para las tabs. Por default arranca en la primera ronda que
	// tenga al menos un partido sin jugar (la "actual"); si no hay, la primera.
	let rondaActivaManual = $state<number | null>(null);
	const rondaActiva = $derived.by<number>(() => {
		if (rondaActivaManual !== null) return rondaActivaManual;
		if (rondas.length === 0) return 0;
		const enCurso = rondas.find((g) =>
			g.partidos.some((p) => p.resultado === null)
		);
		return enCurso?.ronda ?? rondas[rondas.length - 1]!.ronda;
	});

	function seleccionarRonda(r: number) {
		rondaActivaManual = r;
	}

	const grupoActivo = $derived(
		rondas.find((g) => g.ronda === rondaActiva) ?? null
	);

	// Resolucion de refs con PosicionZona (solo el bracket usa esto).
	function descripcionParejaRef(ref: ParejaRef): string {
		if (ref.tipo === 'Inscripcion') {
			const insc = inscripcionesPorId.get(ref.inscripcionId);
			if (!insc) return 'Pareja desconocida';
			return nombreInscripcion(insc, jugadoresPorId);
		}
		if (ref.tipo === 'PosicionZona') {
			const inscId = resolverParejaRefBracket(ref, partidos, zonas);
			if (inscId) {
				const insc = inscripcionesPorId.get(inscId);
				if (insc) return nombreInscripcion(insc, jugadoresPorId);
			}
			return `${ref.posicion}° de Zona ${ref.letraZona}`;
		}
		// GanadorPartido / PerdedorPartido.
		const inscId = resolverParejaRefBracket(ref, partidos, zonas);
		if (inscId) {
			const insc = inscripcionesPorId.get(inscId);
			if (insc) return nombreInscripcion(insc, jugadoresPorId);
		}
		if (ref.tipo === 'GanadorPartido')
			return `Ganador del P${ref.numeroEnZona}`;
		return `Perdedor del P${ref.numeroEnZona}`;
	}

	// Mapa inscripcionId → identificador de origen (ej. "A1", "B2", "C3").
	// Se construye solo para zonas finalizadas: si la zona aun esta en curso,
	// las posiciones pueden cambiar y mostrar un origen "fijo" seria erroneo.
	const origenPorInscripcion = $derived.by<Map<string, string>>(() => {
		const map = new Map<string, string>();
		for (const zona of zonas) {
			const partidosZona = partidos.filter((p) => p.zonaId === zona.id);
			if (estadoZona(zona, partidosZona) !== 'Finalizada') continue;
			const tabla = calcularTablaPosiciones(zona, partidosZona);
			tabla.forEach((fila, idx) => {
				map.set(fila.inscripcionId, `${zona.letra}${idx + 1}`);
			});
		}
		return map;
	});

	// Etiqueta de origen para mostrar al lado de los nombres en el bracket.
	// - PosicionZona: directo (ej. "A1").
	// - GanadorPartido / PerdedorPartido / Inscripcion: resolver a inscripcionId
	//   y buscar en el mapa. Null si no se puede determinar todavia.
	function origenDeParejaRef(ref: ParejaRef): string | null {
		if (ref.tipo === 'PosicionZona') {
			return `${ref.letraZona}${ref.posicion}`;
		}
		const inscId = resolverParejaRefBracket(ref, partidos, zonas);
		if (inscId) {
			return origenPorInscripcion.get(inscId) ?? null;
		}
		return null;
	}

	function nombresDeParejaRef(ref: ParejaRef): string[] {
		const inscId = resolverParejaRefBracket(ref, partidos, zonas);
		if (inscId) {
			const insc = inscripcionesPorId.get(inscId);
			if (insc) return nombresJugadores(insc, jugadoresPorId);
		}
		return [descripcionParejaRef(ref)];
	}

	// ===== Armar / desarmar =====

	let armando = $state(false);

	async function handleArmar() {
		armando = true;
		try {
			await armarBracketCategoria(tid, cid, zonas);
			categoria = await obtenerCategoria(tid, cid);
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Error al armar el cuadro final');
		} finally {
			armando = false;
		}
	}

	async function handleRearmar() {
		const ok = confirm(
			'Re-armar borra los partidos del cuadro final (con sus resultados) y vuelve a generar todo. ¿Continuar?'
		);
		if (!ok) return;
		await handleArmar();
	}

	async function handleDesarmar() {
		const ok = confirm(
			'Desarmar borra todos los partidos del cuadro final. ¿Continuar?'
		);
		if (!ok) return;
		try {
			await desarmarBracketCategoria(tid, cid);
			categoria = await obtenerCategoria(tid, cid);
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Error al desarmar el cuadro final');
		}
	}

	// ===== Carga de resultados =====

	let partidoEditandoId = $state<string | null>(null);

	const partidoEditando = $derived(
		partidoEditandoId
			? (partidos.find((p) => p.id === partidoEditandoId) ?? null)
			: null
	);

	function abrirResultado(partidoId: string) {
		partidoEditandoId = partidoId;
	}

	function cerrarResultado() {
		partidoEditandoId = null;
	}

	async function handleCargarResultado(r: ResultadoPartido) {
		if (!partidoEditandoId) return;
		await cargarResultadoPartido(tid, cid, partidoEditandoId, r);
		partidoEditandoId = null;
	}

	async function handleBorrarResultado() {
		if (!partidoEditandoId) return;
		await borrarResultadoPartido(tid, cid, partidoEditandoId);
		partidoEditandoId = null;
	}
</script>

<div class="mx-auto max-w-4xl p-4 sm:p-6">
	{#if cargando}
		<div class="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500">
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
		</div>
	{:else if errorCarga}
		<div class="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-400">
			{errorCarga}
		</div>
	{:else if categoria}
		<a
			href={`/torneos/${tid}/categorias/${cid}`}
			class="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
		>
			<i class="bi bi-arrow-left"></i>
			Volver
		</a>

		<BreadcrumbCard
			items={[
				{ prefijo: 'Torneo', label: torneo?.nombre ?? '—' },
				{ prefijo: 'Categoría', label: nombreCategoria(categoria) }
			]}
		/>

		<header class="mb-4 flex items-center justify-between">
			<h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">Cuadro Final</h1>
			{#if bracketArmado}
				<KebabMenu
					label="Acciones del cuadro final"
					items={[
						{
							label: 'Re-armar',
							icono: 'bi-arrow-clockwise',
							onClick: handleRearmar
						},
						{
							label: 'Desarmar',
							icono: 'bi-x-circle',
							onClick: handleDesarmar,
							destructive: true
						}
					]}
				/>
			{/if}
		</header>

		{#if !zonasArmadas}
			{#if previewBracket}
				<!-- Vista previa basada en la estructura preferida. Solo
				     informativa: el cuadro real se arma con los clasificados
				     reales una vez terminadas las zonas. -->
				<div class="mb-3 flex items-start gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
					<i class="bi bi-eye mt-0.5 text-base text-gray-500 dark:text-gray-400"></i>
					<div class="flex-1">
						<p class="font-semibold">Vista previa</p>
						<p class="opacity-80">
							Estructura del cuadro final basada en
							{previewBracket.cantidadZonas} zonas de {previewBracket.tamano},
							clasifican {previewBracket.clasifican} por zona. Las posiciones reales se
							resuelven al terminar las zonas.
						</p>
					</div>
				</div>

				<section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
					<h2 class="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
						Cuadro Final ({previewBracket.bracket.length}
						{previewBracket.bracket.length === 1 ? 'partido' : 'partidos'})
					</h2>
					<ol class="space-y-1">
						{#each previewBracket.bracket as p (p.numero)}
							<li class="flex items-baseline gap-2 rounded-md bg-gray-50 px-2 py-1.5 text-xs dark:bg-gray-800/50">
								<span class="w-14 shrink-0 text-[10px] tracking-wider text-gray-400 uppercase">
									{p.fase}
								</span>
								<span class="w-10 shrink-0 font-mono text-[12px] font-semibold text-brand-700 dark:text-brand-300">
									{p.codigo}
								</span>
								<span class="text-gray-700 dark:text-gray-300">{p.label}</span>
							</li>
						{/each}
					</ol>
					<p class="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
						<a
							href={`/torneos/${tid}/categorias/${cid}/zonas`}
							class="font-medium text-brand-700 hover:underline dark:text-brand-300"
						>
							Ir a Zonas
						</a>
						para armar con inscripciones reales.
					</p>
				</section>
			{:else}
				<div class="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
					<i class="bi bi-diagram-3 text-4xl text-gray-300 dark:text-gray-600"></i>
					<p class="mt-3 font-medium">Armá primero las zonas</p>
					<p class="text-sm">
						Los clasificados de las zonas son los que entran al bracket.
					</p>
					<a
						href={`/torneos/${tid}/categorias/${cid}/zonas`}
						class="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
					>
						<i class="bi bi-arrow-right"></i>
						Ir a Zonas
					</a>
				</div>
			{/if}
		{:else if !bracketArmado}
			{#if !todasZonasFinalizadas}
				<div class="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
					<p class="mb-2 flex items-center gap-1.5 font-medium">
						<i class="bi bi-info-circle"></i>
						Faltan zonas por terminar
					</p>
					<p class="mb-3">
						El cuadro final se arma cuando todas las zonas finalizan. Quedan {zonasPendientes.length}
						{zonasPendientes.length === 1 ? 'zona' : 'zonas'} en curso:
					</p>
					<ul class="space-y-1.5">
						{#each zonasPendientes as z (z.id)}
							<li>
								<a
									href={`/torneos/${tid}/categorias/${cid}/zonas/${z.id}`}
									class="inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:underline dark:bg-gray-800 dark:text-amber-200"
								>
									Zona {z.letra}
									<i class="bi bi-arrow-right text-[10px]"></i>
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{:else}
				<div class="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
					<i class="bi bi-trophy text-4xl text-gray-300 dark:text-gray-600"></i>
					<p class="mt-3 font-medium">Listo para armar el cuadro final</p>
					<p class="text-sm">Todas las zonas finalizaron. Ahora podés armar el cuadro.</p>
					<button
						type="button"
						onclick={handleArmar}
						disabled={armando}
						class="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if armando}
							<i class="bi bi-arrow-clockwise animate-spin"></i>
						{:else}
							<i class="bi bi-trophy"></i>
						{/if}
						Armar
					</button>
				</div>
			{/if}
		{:else}
			<!-- Tabs de vista: lista (tabs por ronda) vs cuadro (bracket). -->
			<div class="mb-3 flex w-full items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
				<button
					type="button"
					role="tab"
					aria-selected={vistaCuadro === 'lista'}
					onclick={() => (vistaCuadro = 'lista')}
					class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs transition sm:gap-2 sm:text-sm {vistaCuadro ===
					'lista'
						? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:text-brand-300'
						: 'bg-transparent font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}"
				>
					<i class="bi bi-list-ul text-base"></i>
					<span>Lista</span>
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={vistaCuadro === 'cuadro'}
					onclick={() => (vistaCuadro = 'cuadro')}
					class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs transition sm:gap-2 sm:text-sm {vistaCuadro ===
					'cuadro'
						? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:text-brand-300'
						: 'bg-transparent font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}"
				>
					<i class="bi bi-diagram-2 text-base"></i>
					<span>Cuadro</span>
				</button>
			</div>

			{#if vistaCuadro === 'cuadro'}
				<!-- Vista CUADRO: columnas por ronda, posicionamos cada card en
				     su coordenada Y exacta usando `posicionEnRonda` (slot del
				     cuadro). Asi byes y cruces quedan en la posicion correcta
				     y los conectores caen donde corresponde. -->
				{@const SLOT_RONDA1 = Math.max(
					1,
					...(rondas[0]?.partidos.map((p) => p.posicionEnRonda ?? 0) ?? [1])
				)}
				{@const ALTURA_TOTAL = Math.max(440, SLOT_RONDA1 * 90)}
				<!-- Panel con scroll propio (horizontal y vertical). Necesario
				     para que el sticky de los headers funcione: sticky se ancla
				     al ancestor con overflow auto/scroll mas cercano. -->
				<div
					class="overflow-auto rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
					style="max-height: 75vh;"
				>
					<div class="flex gap-12">
						{#each rondas as g, idxRonda (g.ronda)}
							{@const slotsRonda = SLOT_RONDA1 / Math.pow(2, idxRonda)}
							{@const espacioPorSlot = ALTURA_TOTAL / Math.max(slotsRonda, 1)}
							<div class="shrink-0" style="width: 220px;">
								<!-- Header sticky: fijo arriba al scrollear vertical
								     dentro del panel. Se mueve horizontal con su columna. -->
								<div
									class="sticky top-0 z-10 mb-2 bg-white dark:bg-gray-900"
								>
									<p class="border-b border-gray-100 py-2 text-center text-[11px] font-semibold tracking-wider text-gray-500 uppercase dark:border-gray-800 dark:text-gray-400">
										{g.fase}
									</p>
								</div>
								<!-- Contenedor relativo: cada card se posiciona en
								     Y = (slot - 0.5) * espacioPorSlot, centrada con
								     translateY(-50%). -->
								<div class="relative" style="height: {ALTURA_TOTAL}px;">
									{#each g.partidos as p, idxPartido (p.id)}
										{@const slot = p.posicionEnRonda ?? idxPartido + 1}
										{@const top = (slot - 0.5) * espacioPorSlot}
										<!-- ¿Tiene dependencia con la ronda anterior?
										     Solo si alguna de sus parejas es Ganador o
										     Perdedor de un partido previo. Si ambas son
										     PosicionZona (vienen directo de zona via bye),
										     no hay linea entrante. -->
										{@const tieneEntrada =
											p.pareja1Ref.tipo === 'GanadorPartido' ||
											p.pareja1Ref.tipo === 'PerdedorPartido' ||
											p.pareja2Ref.tipo === 'GanadorPartido' ||
											p.pareja2Ref.tipo === 'PerdedorPartido'}
										{@const jugado = p.resultado !== null}
										{@const gana1 = jugado && p.resultado!.ganadorEs === 1}
										{@const gana2 = jugado && p.resultado!.ganadorEs === 2}
										{@const nombres1 = nombresDeParejaRef(p.pareja1Ref)}
										{@const nombres2 = nombresDeParejaRef(p.pareja2Ref)}
										{@const origen1 = origenDeParejaRef(p.pareja1Ref)}
										{@const origen2 = origenDeParejaRef(p.pareja2Ref)}
										{@const sets = p.resultado?.sets ?? []}
										<!-- Card del partido posicionada por slot. -->
										<button
											type="button"
											onclick={() => abrirResultado(p.id)}
											class="absolute rounded-md border border-gray-200 bg-white text-left shadow-sm transition hover:border-brand-400 hover:shadow dark:border-gray-700 dark:bg-gray-800 dark:hover:border-brand-500"
											style="top: {top}px; left: 0; right: 0; transform: translateY(-50%);"
										>
											<!-- Conector entrante: solo si la card tiene una
											     dependencia real con la ronda anterior. -->
											{#if idxRonda > 0 && tieneEntrada}
												<span
													class="pointer-events-none absolute top-1/2 -left-6 h-px w-6 bg-gray-300 dark:bg-gray-600"
												></span>
											{/if}
											<!-- Pareja 1: nombres apilados (uno arriba del otro) -->
											<div class="flex items-start gap-1.5 border-b border-gray-100 px-2 py-1.5 dark:border-gray-700">
												{#if origen1}
													<span class="mt-0.5 inline-flex h-4 w-7 shrink-0 items-center justify-center rounded bg-gray-100 text-[9px] font-mono font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
														{origen1}
													</span>
												{/if}
												<div class="min-w-0 flex-1">
													{#each nombres1 as n, j (j)}
														<p class="truncate text-[11px] leading-tight {gana1 ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}">
															{n}
														</p>
													{/each}
												</div>
												{#if jugado}
													<span class="mt-0.5 shrink-0 font-mono text-[10px] {gana1 ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-500'}">
														{sets.map((s) => s.p1).join(' ')}
													</span>
												{/if}
											</div>
											<!-- Pareja 2 -->
											<div class="flex items-start gap-1.5 px-2 py-1.5">
												{#if origen2}
													<span class="mt-0.5 inline-flex h-4 w-7 shrink-0 items-center justify-center rounded bg-gray-100 text-[9px] font-mono font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
														{origen2}
													</span>
												{/if}
												<div class="min-w-0 flex-1">
													{#each nombres2 as n, j (j)}
														<p class="truncate text-[11px] leading-tight {gana2 ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}">
															{n}
														</p>
													{/each}
												</div>
												{#if jugado}
													<span class="mt-0.5 shrink-0 font-mono text-[10px] {gana2 ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-500'}">
														{sets.map((s) => s.p2).join(' ')}
													</span>
												{/if}
											</div>
											<!-- Conector saliente: linea horizontal hasta el
											     medio del gap + linea vertical hasta la card de
											     la ronda siguiente (calculada por su slot). -->
											{#if idxRonda < rondas.length - 1}
												{@const slotSig = Math.ceil(slot / 2)}
												{@const slotsSig = slotsRonda / 2}
												{@const topSig = (slotSig - 0.5) * (ALTURA_TOTAL / Math.max(slotsSig, 1))}
												{@const dy = topSig - top}
												<span
													class="pointer-events-none absolute top-1/2 -right-6 h-px w-6 bg-gray-300 dark:bg-gray-600"
												></span>
												{#if dy > 0}
													<span
														class="pointer-events-none absolute top-1/2 -right-6 w-px bg-gray-300 dark:bg-gray-600"
														style="height: {dy}px;"
													></span>
												{:else if dy < 0}
													<span
														class="pointer-events-none absolute -right-6 w-px bg-gray-300 dark:bg-gray-600"
														style="top: calc(50% + {dy}px); height: {Math.abs(dy)}px;"
													></span>
												{/if}
											{/if}
										</button>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else}

			<!-- Tabs segmented control: una por cada ronda. -->
			<div class="mb-4 flex w-full items-center gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
				{#each rondas as g (g.ronda)}
					{@const jugados = g.partidos.filter((p) => p.resultado !== null).length}
					{@const finalizada = jugados === g.partidos.length}
					<button
						type="button"
						role="tab"
						aria-selected={rondaActiva === g.ronda}
						onclick={() => seleccionarRonda(g.ronda)}
						class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs transition sm:gap-2 sm:px-3 sm:text-sm {rondaActiva ===
						g.ronda
							? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:text-brand-300'
							: 'bg-transparent font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}"
					>
						<span class="whitespace-nowrap">{g.fase}</span>
						<span
							class="inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold {rondaActiva ===
							g.ronda
								? finalizada
									? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
									: 'bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300'
								: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}"
						>
							{jugados}/{g.partidos.length}
						</span>
					</button>
				{/each}
			</div>

			<!-- Solo la ronda activa. -->
			{#if grupoActivo}
				<section>
					<ul class="space-y-2">
						{#each grupoActivo.partidos as p (p.id)}
							{@const jugado = p.resultado !== null}
							{@const gana1 = jugado && p.resultado!.ganadorEs === 1}
							{@const gana2 = jugado && p.resultado!.ganadorEs === 2}
							{@const nombres1 = nombresDeParejaRef(p.pareja1Ref)}
							{@const nombres2 = nombresDeParejaRef(p.pareja2Ref)}
							{@const origen1 = origenDeParejaRef(p.pareja1Ref)}
							{@const origen2 = origenDeParejaRef(p.pareja2Ref)}
							{@const sets = p.resultado?.sets ?? []}
							{@const esWO = jugado && p.resultado!.motivo === 'WO'}
							<li class="rounded-lg border bg-white p-3 {jugado ? 'border-gray-200 dark:border-gray-800' : 'border-gray-100 dark:border-gray-800'} dark:bg-gray-900">
								<div class="mb-2 flex items-center justify-between gap-2">
									<p class="text-xs font-semibold tracking-wide text-brand-700 dark:text-brand-300">
										P{p.numeroEnZona}
									</p>
									{#if jugado && p.resultado!.motivo !== 'normal'}
										<span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 uppercase dark:bg-amber-900/40 dark:text-amber-300">
											{p.resultado!.motivo === 'WO' ? 'W.O.' : 'abandono'}
										</span>
									{/if}
								</div>

								<div class="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 gap-y-2 sm:gap-x-3">
									{#if origen1}
										<span class="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-center font-mono text-[10px] font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-400">
											{origen1}
										</span>
									{:else}
										<span class="shrink-0"></span>
									{/if}
									<div class="min-w-0">
										{#each nombres1 as n, j (j)}
											<p class="truncate text-sm {gana1 ? 'font-semibold text-brand-700 dark:text-brand-300' : 'font-medium text-gray-900 dark:text-gray-100'}">
												{n}
											</p>
										{/each}
									</div>
									{#if jugado && !esWO && sets.length > 0}
										<div class="flex shrink-0 gap-1.5">
											{#each sets as s, i (i)}
												<span class="font-mono text-sm {gana1 ? 'font-semibold text-brand-700 dark:text-brand-300' : 'text-gray-700 dark:text-gray-300'}">
													{s.p1}{#if s.tiebreakP1 !== undefined}<sup class="text-[10px]">{s.tiebreakP1}</sup>{/if}
												</span>
											{/each}
										</div>
									{:else if esWO}
										<span class="shrink-0 font-mono text-xs {gana1 ? 'font-semibold text-brand-700 dark:text-brand-300' : 'text-gray-500 dark:text-gray-400'}">
											{gana1 ? 'W' : '–'}
										</span>
									{:else}
										<span class="shrink-0"></span>
									{/if}
									<div class="w-4 shrink-0 text-right">
										{#if gana1}
											<i class="bi bi-trophy-fill text-xs text-brand-500"></i>
										{/if}
									</div>

									{#if origen2}
										<span class="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-center font-mono text-[10px] font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-400">
											{origen2}
										</span>
									{:else}
										<span class="shrink-0"></span>
									{/if}
									<div class="min-w-0">
										{#each nombres2 as n, j (j)}
											<p class="truncate text-sm {gana2 ? 'font-semibold text-brand-700 dark:text-brand-300' : 'font-medium text-gray-900 dark:text-gray-100'}">
												{n}
											</p>
										{/each}
									</div>
									{#if jugado && !esWO && sets.length > 0}
										<div class="flex shrink-0 gap-1.5">
											{#each sets as s, i (i)}
												<span class="font-mono text-sm {gana2 ? 'font-semibold text-brand-700 dark:text-brand-300' : 'text-gray-700 dark:text-gray-300'}">
													{s.p2}{#if s.tiebreakP2 !== undefined}<sup class="text-[10px]">{s.tiebreakP2}</sup>{/if}
												</span>
											{/each}
										</div>
									{:else if esWO}
										<span class="shrink-0 font-mono text-xs {gana2 ? 'font-semibold text-brand-700 dark:text-brand-300' : 'text-gray-500 dark:text-gray-400'}">
											{gana2 ? 'W' : '–'}
										</span>
									{:else}
										<span class="shrink-0"></span>
									{/if}
									<div class="w-4 shrink-0 text-right">
										{#if gana2}
											<i class="bi bi-trophy-fill text-xs text-brand-500"></i>
										{/if}
									</div>
								</div>

								<div class="mt-3 flex justify-end border-t border-gray-100 pt-2 dark:border-gray-800">
									<button
										type="button"
										onclick={() => abrirResultado(p.id)}
										class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/40"
									>
										<i class="bi {jugado ? 'bi-pencil' : 'bi-plus-circle'}"></i>
										{jugado ? 'Editar' : 'Cargar'}
									</button>
								</div>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
			{/if}
		{/if}
	{/if}
</div>

<!-- Sheet cargar/editar resultado de partido. -->
<BottomSheet
	open={partidoEditando !== null}
	onClose={cerrarResultado}
	title={partidoEditando?.resultado ? 'Editar resultado' : 'Cargar resultado'}
>
	{#if partidoEditando}
		{#key partidoEditando.id}
			<ResultadoForm
				initial={partidoEditando.resultado}
				nombresPareja1={nombresDeParejaRef(partidoEditando.pareja1Ref)}
				nombresPareja2={nombresDeParejaRef(partidoEditando.pareja2Ref)}
				submitLabel={partidoEditando.resultado ? 'Guardar' : 'Cargar'}
				onSubmit={handleCargarResultado}
				onCancel={cerrarResultado}
				onBorrar={partidoEditando.resultado ? handleBorrarResultado : undefined}
				onTest={onTestResultado}
			/>
		{/key}
	{/if}
</BottomSheet>
