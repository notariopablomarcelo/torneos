<script lang="ts">
	import { page } from '$app/state';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import GrillaProgramacion from '$lib/components/GrillaProgramacion.svelte';
	import ResultadoForm from '$lib/components/ResultadoForm.svelte';
	import { suscribirTorneo } from '$lib/services/torneos';
	import { suscribirCategorias } from '$lib/services/categorias';
	import {
		actualizarProgramacionPartido,
		quitarProgramacionPartido,
		suscribirCanchasDelTorneo,
		suscribirInscripcionesDelTorneo,
		suscribirPartidosDelTorneo,
		suscribirTodasLasCanchas,
		suscribirZonasDelTorneo
	} from '$lib/services/programacion';
	import {
		borrarResultadoPartido,
		cargarResultadoPartido
	} from '$lib/services/armado';
	import { suscribirJugadores } from '$lib/services/jugadores';
	import { resolverParejaRefBracket } from '$lib/services/bracket';
	import { suscribirSedes } from '$lib/services/sedes';
	import { AMBIENTE } from '$lib/firebase';
	import { generarResultadoPartido } from '$lib/dev/factories';
	import {
		DURACION_PARTIDO_MIN,
		mensajeConflicto,
		parejasPotencialesDePartido,
		partidosAncestrosDirectos,
		validarProgramacion,
		type PartidoProgramado
	} from '$lib/programacion/algoritmo';
	import { etiquetaFechaCorta, rangoFechasInclusivo } from '$lib/dates';
	import {
		GENEROS_CATEGORIA,
		NIVELES_CATEGORIA,
		nombreCategoria,
		type Categoria,
		type Torneo
	} from '$lib/types/torneo';
	import {
		nombresJugadores,
		type Inscripcion
	} from '$lib/types/inscripcion';
	import type { Jugador } from '$lib/types/jugador';
	import type {
		ParejaRef,
		Partido,
		ProgramacionPartido,
		ResultadoPartido,
		Zona
	} from '$lib/types/armado';
	import type { TorneoCancha } from '$lib/types/programacion';
	import type { Cancha, Sede } from '$lib/types/sede';

	const id = $derived(page.params.id as string);

	let torneo = $state<Torneo | null>(null);
	let categorias = $state<Categoria[]>([]);
	let partidos = $state<Partido[]>([]);
	let zonas = $state<Zona[]>([]);
	let inscripciones = $state<Inscripcion[]>([]);
	let jugadores = $state<Jugador[]>([]);
	let canchasTorneo = $state<TorneoCancha[]>([]);
	let canchasGlobales = $state<Cancha[]>([]);
	let sedes = $state<Sede[]>([]);
	let cargando = $state(true);

	$effect(() => {
		const tid = id;
		cargando = true;

		const unsubT = suscribirTorneo(tid, (t) => {
			torneo = t;
			cargando = false;
		});
		const unsubCats = suscribirCategorias(tid, (cs) => {
			categorias = cs;
		});
		const unsubP = suscribirPartidosDelTorneo(tid, (ps) => {
			partidos = ps;
		});
		const unsubZ = suscribirZonasDelTorneo(tid, (zs) => {
			zonas = zs;
		});
		const unsubInsc = suscribirInscripcionesDelTorneo(tid, (is) => {
			inscripciones = is;
		});
		const unsubJug = suscribirJugadores((js) => {
			jugadores = js;
		});
		const unsubCT = suscribirCanchasDelTorneo(tid, (cs) => {
			canchasTorneo = cs;
		});
		const unsubCG = suscribirTodasLasCanchas((cs) => {
			canchasGlobales = cs;
		});
		const unsubS = suscribirSedes((s) => {
			sedes = s;
		});

		return () => {
			unsubT();
			unsubCats();
			unsubP();
			unsubZ();
			unsubInsc();
			unsubJug();
			unsubCT();
			unsubCG();
			unsubS();
		};
	});

	const categoriasPorId = $derived(new Map(categorias.map((c) => [c.id, c])));
	const inscripcionesPorId = $derived(
		new Map(inscripciones.map((i) => [i.id, i]))
	);
	const jugadoresPorId = $derived(new Map(jugadores.map((j) => [j.id, j])));
	const zonasPorId = $derived(new Map(zonas.map((z) => [z.id, z])));
	const canchasTorneoPorCanchaId = $derived(
		new Map(canchasTorneo.map((tc) => [tc.canchaId, tc]))
	);
	const canchasPorId = $derived(new Map(canchasGlobales.map((c) => [c.id, c])));
	const sedesPorId = $derived(new Map(sedes.map((s) => [s.id, s])));

	const fechasTorneo = $derived(
		torneo ? rangoFechasInclusivo(torneo.fechaInicio, torneo.fechaFin) : []
	);

	const categoriasOrdenadas = $derived(
		[...categorias].sort((a, b) => {
			const d = NIVELES_CATEGORIA.indexOf(a.nivel) - NIVELES_CATEGORIA.indexOf(b.nivel);
			if (d !== 0) return d;
			return GENEROS_CATEGORIA.indexOf(a.genero) - GENEROS_CATEGORIA.indexOf(b.genero);
		})
	);

	// Selector de fecha (igual que en programacion).
	let fechaActiva = $state<string>('');
	$effect(() => {
		if (!fechaActiva && fechasTorneo.length > 0) {
			fechaActiva = fechasTorneo[0]!;
		}
	});
	const indiceFechaActiva = $derived(fechasTorneo.indexOf(fechaActiva));
	function fechaAnterior() {
		const idx = indiceFechaActiva;
		if (idx > 0) fechaActiva = fechasTorneo[idx - 1]!;
	}
	function fechaSiguiente() {
		const idx = indiceFechaActiva;
		if (idx >= 0 && idx < fechasTorneo.length - 1)
			fechaActiva = fechasTorneo[idx + 1]!;
	}

	// Colores y filtros (idem programacion).
	const PALETA_CAT: { bg: string; fg: string }[] = [
		{ bg: '#dcfce7', fg: '#166534' },
		{ bg: '#dbeafe', fg: '#1e40af' },
		{ bg: '#fef3c7', fg: '#92400e' },
		{ bg: '#fee2e2', fg: '#991b1b' },
		{ bg: '#f3e8ff', fg: '#6b21a8' },
		{ bg: '#cffafe', fg: '#155e75' },
		{ bg: '#ffedd5', fg: '#9a3412' },
		{ bg: '#fce7f3', fg: '#9d174d' }
	];
	const colorPorCategoria = $derived.by<Map<string, { bg: string; fg: string }>>(() => {
		const map = new Map<string, { bg: string; fg: string }>();
		categoriasOrdenadas.forEach((cat, idx) => {
			map.set(cat.id, PALETA_CAT[idx % PALETA_CAT.length]!);
		});
		return map;
	});
	function colorCategoria(catId: string): { bg: string; fg: string } {
		return colorPorCategoria.get(catId) ?? PALETA_CAT[0]!;
	}

	let filtroCategoriasIds = $state<Set<string>>(new Set());
	function toggleFiltroCategoria(catId: string) {
		const next = new Set(filtroCategoriasIds);
		if (next.has(catId)) next.delete(catId);
		else next.add(catId);
		filtroCategoriasIds = next;
	}

	function nombreContexto(p: Partido): string {
		if (p.zonaId !== null) {
			const z = zonasPorId.get(p.zonaId);
			return z ? `Zona ${z.letra}` : 'Zona';
		}
		return p.fase;
	}

	// Paleta de colores para PILLS de contexto (zona/fase). Saturados con
	// fg blanco para que contrasten claro contra el fondo pastel del card
	// de la categoria y entre si — los pastel se parecen demasiado cuando
	// hay 4+ zonas en la misma categoria.
	const PALETA_CONTEXTO: { bg: string; fg: string }[] = [
		{ bg: '#dc2626', fg: '#ffffff' }, // red-600
		{ bg: '#2563eb', fg: '#ffffff' }, // blue-600
		{ bg: '#ca8a04', fg: '#ffffff' }, // yellow-600
		{ bg: '#7c3aed', fg: '#ffffff' }, // violet-600
		{ bg: '#16a34a', fg: '#ffffff' }, // green-600
		{ bg: '#0891b2', fg: '#ffffff' }, // cyan-600
		{ bg: '#ea580c', fg: '#ffffff' }, // orange-600
		{ bg: '#db2777', fg: '#ffffff' } // pink-600
	];
	const FASES_ORDEN = ['32vos', '16vos', '8vos', '4tos', 'Semis', 'Final'];

	// Mapa derivado por categoria → { contextoKey → color }. Garantiza:
	// 1. Ningun pill coincide con el fondo del card de la categoria.
	// 2. Dentro de la misma categoria, los pills de zonas/fases distintas
	//    NO comparten color (hasta agotar la paleta).
	//
	// Estrategia: por cada categoria recorremos sus zonas (orden alfabetico
	// por letra) y despues las fases del bracket presentes. Asignamos el
	// proximo color libre de PALETA_CONTEXTO que no choque con la
	// categoria ni con uno ya usado en ESA categoria. Si se agota la
	// paleta (>7 contextos distintos), ciclamos.
	type ColorPair = { bg: string; fg: string };
	const coloresPorCategoria = $derived.by<
		Map<string, Map<string, ColorPair>>
	>(() => {
		const out = new Map<string, Map<string, ColorPair>>();
		for (const cat of categorias) {
			const colorCat = colorCategoria(cat.id).bg;
			const usados = new Set<string>([colorCat]);
			const mapaCat = new Map<string, ColorPair>();

			// Contextos de esta categoria: zonas (por letra) + fases bracket.
			const zonasCat = zonas
				.filter((z) => z.categoriaId === cat.id)
				.sort((a, b) => a.letra.localeCompare(b.letra));
			const fasesPresentes = new Set<string>();
			for (const p of partidos) {
				if (p.categoriaId !== cat.id) continue;
				if (p.zonaId === null) fasesPresentes.add(p.fase);
			}
			const fasesOrdenadas = FASES_ORDEN.filter((f) => fasesPresentes.has(f));

			const claves: string[] = [
				...zonasCat.map((z) => `zona-${z.letra}`),
				...fasesOrdenadas.map((f) => `fase-${f}`)
			];

			function pickProximo(): ColorPair {
				for (const c of PALETA_CONTEXTO) {
					if (!usados.has(c.bg)) return c;
				}
				return PALETA_CONTEXTO[0]!; // se agoto la paleta
			}

			for (const key of claves) {
				const color = pickProximo();
				mapaCat.set(key, color);
				usados.add(color.bg);
			}
			out.set(cat.id, mapaCat);
		}
		return out;
	});

	function colorContexto(p: Partido): ColorPair {
		const mapaCat = coloresPorCategoria.get(p.categoriaId);
		if (!mapaCat) return PALETA_CONTEXTO[0]!;
		const key =
			p.zonaId !== null
				? `zona-${zonasPorId.get(p.zonaId)?.letra ?? '?'}`
				: `fase-${p.fase}`;
		return mapaCat.get(key) ?? PALETA_CONTEXTO[0]!;
	}

	function labelPartidoCorto(p: Partido): string {
		return `${nombreContexto(p)} · P${p.numeroEnZona}`;
	}

	function labelPartido(p: Partido): string {
		const cat = categoriasPorId.get(p.categoriaId);
		return `${cat ? nombreCategoria(cat) : '?'} · ${nombreContexto(p)} · P${p.numeroEnZona}`;
	}

	// Texto descriptivo de una ref simbolica cuando todavia no se puede
	// resolver a una pareja concreta. La grilla la muestra como UNA linea
	// dentro del slot de la pareja (en vez de dejarlo vacio).
	function descripcionRef(ref: ParejaRef): string {
		switch (ref.tipo) {
			case 'PosicionZona':
				return `${ref.posicion}° de Zona ${ref.letraZona}`;
			case 'GanadorPartido':
				return `Ganador P${ref.numeroEnZona}`;
			case 'PerdedorPartido':
				return `Perdedor P${ref.numeroEnZona}`;
			case 'Inscripcion':
				return '?';
		}
	}

	function nombresParejasPartido(p: Partido): {
		pareja1: string[] | null;
		pareja2: string[] | null;
	} {
		function resolver(ref: ParejaRef): string[] | null {
			if (ref.tipo === 'Inscripcion') {
				const insc = inscripcionesPorId.get(ref.inscripcionId);
				return insc ? nombresJugadores(insc, jugadoresPorId) : null;
			}
			// Pasamos `p.zonaId` como contexto: si p es de zona DO, las
			// refs Ganador/Perdedor apuntan a partidos de la MISMA zona.
			// Si es bracket, `zonaId === null` y la ref vive en bracket.
			const inscId = resolverParejaRefBracket(
				ref,
				partidos,
				zonas,
				p.zonaId
			);
			if (inscId) {
				const insc = inscripcionesPorId.get(inscId);
				if (insc) return nombresJugadores(insc, jugadoresPorId);
			}
			// Fallback: mostrar la descripcion simbolica ("Ganador P1",
			// "1° de Zona C"...) como una sola linea. Asi el bloque nunca
			// queda vacio aunque el padre no este definido todavia.
			return [descripcionRef(ref)];
		}
		return {
			pareja1: resolver(p.pareja1Ref),
			pareja2: resolver(p.pareja2Ref)
		};
	}

	function labelCancha(canchaId: string): string {
		const cancha = canchasPorId.get(canchaId);
		const sede = cancha ? sedesPorId.get(cancha.sedeId) : null;
		if (cancha && sede) return `${cancha.nombre} · ${sede.nombre}`;
		return cancha?.nombre ?? 'Cancha desconocida';
	}

	// =====
	// Modal de programacion
	// =====

	let partidoEditandoId = $state<string | null>(null);
	const partidoEditando = $derived(
		partidoEditandoId
			? (partidos.find((p) => p.id === partidoEditandoId) ?? null)
			: null
	);

	let formFecha = $state<string>('');
	let formHora = $state<string>('');
	let formCanchaId = $state<string>('');
	let guardando = $state(false);

	$effect(() => {
		if (!partidoEditando) {
			formFecha = '';
			formHora = '';
			formCanchaId = '';
			return;
		}
		if (partidoEditando.programacion) {
			formFecha = partidoEditando.programacion.fecha;
			formHora = partidoEditando.programacion.hora;
			formCanchaId = partidoEditando.programacion.canchaId;
		} else {
			formFecha = fechaActiva || fechasTorneo[0] || '';
			formHora = '10:00';
			formCanchaId = canchasTorneo[0]?.canchaId ?? '';
		}
	});

	const propuesta = $derived<ProgramacionPartido | null>(
		formFecha && formHora && formCanchaId
			? { fecha: formFecha, hora: formHora, canchaId: formCanchaId }
			: null
	);

	const partidosProgramados = $derived<PartidoProgramado[]>(
		partidos
			.filter((p) => p.programacion)
			.map((p) => ({
				id: p.id,
				programacion: p.programacion!,
				label: labelPartido(p),
				parejas: parejasPotencialesDePartido(p)
			}))
	);

	// Bloqueos horarios por inscripcionId (pareja). Se arman a partir de
	// todas las inscripciones del torneo.
	const bloqueosPorPareja = $derived.by(() => {
		const out: Record<
			string,
			{ jugadorId: string; fecha: string; desde: string; hasta: string }[]
		> = {};
		for (const i of inscripciones) {
			const bs = i.bloqueosJugadores ?? [];
			if (bs.length > 0) out[i.id] = bs;
		}
		return out;
	});

	const conflictos = $derived.by(() => {
		if (!propuesta || !partidoEditandoId || !partidoEditando) return [];
		const tc = canchasTorneoPorCanchaId.get(propuesta.canchaId) ?? null;
		const esZona = partidoEditando.zonaId !== null;
		return validarProgramacion(
			propuesta,
			partidoEditandoId,
			parejasPotencialesDePartido(partidoEditando),
			partidosProgramados,
			tc,
			{
				descansoEntreParejas: esZona ? 75 : 90,
				bloqueosPorPareja,
				partidosPadre: partidosAncestrosDirectos(partidoEditando, partidos, zonas)
			}
		);
	});

	// Tab activo del modal del bloque. Default 'resultado' porque al
	// clickear el bloque lo mas comun es cargar / editar marcador. El
	// organizador puede cambiar a 'programacion' para mover el horario.
	type TabEdicion = 'programacion' | 'resultado';
	let tabEdicion = $state<TabEdicion>('resultado');

	function abrirEdicion(pid: string) {
		partidoEditandoId = pid;
		tabEdicion = 'resultado';
	}
	function cerrarEdicion() {
		partidoEditandoId = null;
	}

	// =====
	// Resultado del partido
	// =====

	// Resuelve los nombres de una pareja (Inscripcion directa, PosicionZona
	// si la zona termino, o GanadorPartido/PerdedorPartido si el padre tiene
	// resultado cargado). Si no se puede resolver, devuelve null.
	function nombresDeParejaRef(
		ref: ParejaRef,
		zonaIdContexto: string | null
	): string[] | null {
		const inscId = resolverParejaRefBracket(
			ref,
			partidos,
			zonas,
			zonaIdContexto
		);
		if (!inscId) return null;
		const insc = inscripciones.find((i) => i.id === inscId);
		if (!insc) return null;
		return nombresJugadores(insc, jugadoresPorId);
	}

	const parejasResueltas = $derived.by(() => {
		if (!partidoEditando) return null;
		const ctx = partidoEditando.zonaId;
		const n1 = nombresDeParejaRef(partidoEditando.pareja1Ref, ctx);
		const n2 = nombresDeParejaRef(partidoEditando.pareja2Ref, ctx);
		if (!n1 || !n2) return null;
		return { nombresPareja1: n1, nombresPareja2: n2 };
	});

	async function handleCargarResultado(r: ResultadoPartido) {
		if (!partidoEditando) return;
		await cargarResultadoPartido(
			id,
			partidoEditando.categoriaId,
			partidoEditando.id,
			r
		);
		partidoEditandoId = null;
	}

	async function handleBorrarResultado() {
		if (!partidoEditando) return;
		await borrarResultadoPartido(
			id,
			partidoEditando.categoriaId,
			partidoEditando.id
		);
		partidoEditandoId = null;
	}

	// Test factory disponible solo fuera de produccion — igual que en las
	// demas pantallas que cargan resultado (zona y bracket).
	const onTestResultado =
		AMBIENTE !== 'prod' ? generarResultadoPartido : undefined;

	async function guardar() {
		if (!partidoEditando || !propuesta) return;
		// Conflictos = advertencias, no bloqueos. El admin puede guardar igual.
		guardando = true;
		try {
			await actualizarProgramacionPartido(
				id,
				partidoEditando.categoriaId,
				partidoEditando.id,
				propuesta
			);
			partidoEditandoId = null;
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Error al guardar');
		} finally {
			guardando = false;
		}
	}

	async function quitar() {
		if (!partidoEditando) return;
		guardando = true;
		try {
			await quitarProgramacionPartido(
				id,
				partidoEditando.categoriaId,
				partidoEditando.id
			);
			partidoEditandoId = null;
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Error al quitar');
		} finally {
			guardando = false;
		}
	}
</script>

<!-- Full-width: rompe el max-w-4xl del layout padre con max-w-full. -->
<div class="mx-auto w-full max-w-screen-xl px-3 py-2 sm:px-4">
	{#if cargando}
		<div class="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500">
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
		</div>
	{:else if !torneo}
		<div class="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-400">
			No se encontró el torneo.
		</div>
	{:else}
		<!-- Header compacto: volver + torneo + selector dia + filtros en una
		     sola toolbar. En mobile, los chips wrap. -->
		<header class="mb-2 flex flex-wrap items-center gap-2">
			<a
				href={`/torneos/${id}/programacion`}
				aria-label="Volver"
				title="Volver"
				class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
			>
				<i class="bi bi-arrow-left"></i>
			</a>
			<div class="min-w-0 flex-1">
				<p class="truncate text-xs text-gray-500 dark:text-gray-400">
					{torneo.nombre}
				</p>
				<p class="text-sm font-bold text-gray-900 dark:text-gray-100">
					Grilla
				</p>
			</div>

			<!-- Selector de día (en la misma fila que el header). -->
			{#if canchasTorneo.length > 0}
				<div class="flex shrink-0 items-center gap-1">
					<button
						type="button"
						onclick={fechaAnterior}
						disabled={indiceFechaActiva <= 0}
						aria-label="Día anterior"
						class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
					>
						<i class="bi bi-chevron-left"></i>
					</button>
					<div class="min-w-[110px] text-center">
						<p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
							{fechaActiva ? etiquetaFechaCorta(fechaActiva) : '—'}
						</p>
						<p class="text-[10px] text-gray-500 dark:text-gray-400">
							Día {indiceFechaActiva + 1} de {fechasTorneo.length}
						</p>
					</div>
					<button
						type="button"
						onclick={fechaSiguiente}
						disabled={indiceFechaActiva >= fechasTorneo.length - 1}
						aria-label="Día siguiente"
						class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
					>
						<i class="bi bi-chevron-right"></i>
					</button>
				</div>
			{/if}
		</header>

		{#if canchasTorneo.length === 0}
			<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
				<p class="flex items-center gap-1.5 font-medium">
					<i class="bi bi-info-circle"></i>
					Asigná canchas primero
				</p>
				<p class="mt-1">
					<a href={`/torneos/${id}/canchas`} class="font-medium underline">Ir a Canchas →</a>
				</p>
			</div>
		{:else}
			<!-- Filtros por categoría (debajo del header). -->
			{#if categoriasOrdenadas.length > 0}
				<div class="mb-2 flex flex-wrap gap-1">
					{#each categoriasOrdenadas as cat (cat.id)}
						{@const activo =
							filtroCategoriasIds.size === 0 || filtroCategoriasIds.has(cat.id)}
						{@const color = colorCategoria(cat.id)}
						<button
							type="button"
							onclick={() => toggleFiltroCategoria(cat.id)}
							aria-pressed={activo}
							class="rounded-full px-2 py-0.5 text-[10px] font-semibold transition {activo
								? ''
								: 'opacity-40 grayscale'}"
							style={activo
								? `background-color: ${color.bg}; color: ${color.fg};`
								: ''}
						>
							{nombreCategoria(cat)}
						</button>
					{/each}
				</div>
			{/if}

			<GrillaProgramacion
				partidos={partidos}
				fecha={fechaActiva}
				canchasTorneo={canchasTorneo}
				canchasGlobales={canchasGlobales}
				sedes={sedes}
				filtroCategoriasIds={filtroCategoriasIds}
				colorCategoria={colorCategoria}
				labelPartido={labelPartidoCorto}
				contextoLabel={nombreContexto}
				colorContexto={colorContexto}
				nombresParejas={nombresParejasPartido}
				ganadorPartido={(p) => p.resultado?.ganadorEs ?? null}
				onPartidoClick={abrirEdicion}
			/>
		{/if}
	{/if}
</div>

<!-- Modal del bloque: tabs Programación / Resultado. -->
<BottomSheet
	open={partidoEditando !== null}
	onClose={cerrarEdicion}
	title="Partido"
>
	{#if partidoEditando}
		<p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
			{labelPartido(partidoEditando)}
		</p>

		<!-- Tabs Programación / Resultado. El segundo solo si las parejas
		     se pueden resolver (Inscripcion concreta o derivada). -->
		<div class="mb-4 flex w-full items-center gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
			<button
				type="button"
				onclick={() => (tabEdicion = 'programacion')}
				class="flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition {tabEdicion ===
				'programacion'
					? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
					: 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}"
			>
				<i class="bi bi-calendar3"></i>
				Programación
			</button>
			<button
				type="button"
				onclick={() => (tabEdicion = 'resultado')}
				disabled={!parejasResueltas}
				title={!parejasResueltas
					? 'Esperá a que las parejas del partido estén definidas'
					: ''}
				class="flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 {tabEdicion ===
				'resultado'
					? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
					: 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}"
			>
				<i class="bi bi-trophy"></i>
				Resultado
				{#if partidoEditando.resultado}
					<i class="bi bi-check-circle-fill text-emerald-500 text-[10px]"></i>
				{/if}
			</button>
		</div>

		{#if tabEdicion === 'resultado' && parejasResueltas}
			{#key partidoEditando.id}
				<ResultadoForm
					initial={partidoEditando.resultado}
					nombresPareja1={parejasResueltas.nombresPareja1}
					nombresPareja2={parejasResueltas.nombresPareja2}
					submitLabel={partidoEditando.resultado ? 'Guardar' : 'Cargar'}
					onSubmit={handleCargarResultado}
					onCancel={cerrarEdicion}
					onBorrar={partidoEditando.resultado
						? handleBorrarResultado
						: undefined}
					onTest={onTestResultado}
				/>
			{/key}
		{:else}
		<div class="space-y-3">
			<label class="block">
				<span class="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">Fecha</span>
				<select
					bind:value={formFecha}
					class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
				>
					{#each fechasTorneo as f (f)}
						<option value={f}>{etiquetaFechaCorta(f)}</option>
					{/each}
				</select>
			</label>

			<label class="block">
				<span class="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">Cancha</span>
				<select
					bind:value={formCanchaId}
					class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
				>
					{#each canchasTorneo as tc (tc.id)}
						<option value={tc.canchaId}>{labelCancha(tc.canchaId)}</option>
					{/each}
				</select>
			</label>

			<label class="block">
				<span class="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
					Hora (duración estimada {DURACION_PARTIDO_MIN} min)
				</span>
				<input
					type="time"
					bind:value={formHora}
					class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
				/>
			</label>
		</div>

		{#if conflictos.length > 0}
			<div class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
				<p class="mb-1 flex items-center gap-1.5 font-semibold">
					<i class="bi bi-exclamation-triangle-fill"></i>
					{conflictos.length === 1 ? 'Advertencia:' : 'Advertencias:'}
				</p>
				<ul class="list-disc space-y-1 pl-5">
					{#each conflictos as c, i (i)}
						<li>{mensajeConflicto(c)}</li>
					{/each}
				</ul>
				<p class="mt-2 text-[11px] opacity-80">
					Podés guardar igual si tenés un motivo.
				</p>
			</div>
		{:else if propuesta}
			<p class="mt-4 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
				<i class="bi bi-check-circle-fill"></i>
				Slot disponible.
			</p>
		{/if}

		<div class="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
			<div class="flex items-center gap-2">
				{#if partidoEditando.programacion}
					<button
						type="button"
						onclick={quitar}
						disabled={guardando}
						class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/40 sm:flex-none"
					>
						<i class="bi bi-x-circle"></i>
						Quitar
					</button>
				{/if}
			</div>
			<div class="flex items-center gap-2 sm:gap-3">
				<button
					type="button"
					onclick={cerrarEdicion}
					disabled={guardando}
					class="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 sm:flex-none"
				>
					Cancelar
				</button>
				<button
					type="button"
					onclick={guardar}
					disabled={guardando || !propuesta}
					class="inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none {conflictos.length >
					0
						? 'bg-amber-600 hover:bg-amber-700'
						: 'bg-brand-500 hover:bg-brand-600'}"
				>
					{#if guardando}<i class="bi bi-arrow-clockwise animate-spin"></i>{/if}
					{conflictos.length > 0 ? 'Guardar igual' : 'Guardar'}
				</button>
			</div>
		</div>
		{/if}
	{/if}
</BottomSheet>
