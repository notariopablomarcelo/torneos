<script lang="ts">
	import { page } from '$app/state';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import BreadcrumbCard from '$lib/components/BreadcrumbCard.svelte';
	import GrillaProgramacion from '$lib/components/GrillaProgramacion.svelte';
	import { suscribirTorneo } from '$lib/services/torneos';
	import { suscribirCategorias } from '$lib/services/categorias';
	import {
		actualizarProgramacionPartido,
		aplicarAsignacionesSugeridas,
		quitarProgramacionPartido,
		suscribirCanchasDelTorneo,
		suscribirInscripcionesDelTorneo,
		suscribirPartidosDelTorneo,
		suscribirTodasLasCanchas,
		suscribirZonasDelTorneo
	} from '$lib/services/programacion';
	import { suscribirJugadores } from '$lib/services/jugadores';
	import { resolverParejaRefBracket } from '$lib/services/bracket';
	import {
		nombresJugadores,
		type Inscripcion
	} from '$lib/types/inscripcion';
	import type { Jugador } from '$lib/types/jugador';
	import {
		sugerirProgramacion,
		type Asignacion,
		type PartidoParaSugerir
	} from '$lib/programacion/sugerencia';
	import { suscribirSedes } from '$lib/services/sedes';
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
	import type { ParejaRef, Partido, ProgramacionPartido, Zona } from '$lib/types/armado';
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
		torneo = null;
		categorias = [];
		partidos = [];
		canchasTorneo = [];
		canchasGlobales = [];
		sedes = [];

		const unsubT = suscribirTorneo(tid, (t) => {
			torneo = t;
			actualizarCargando();
		});
		const unsubCats = suscribirCategorias(tid, (cs) => {
			categorias = cs;
		});
		const unsubP = suscribirPartidosDelTorneo(tid, (ps) => {
			partidos = ps;
			actualizarCargando();
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

		function actualizarCargando() {
			if (torneo) cargando = false;
		}

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

	const inscripcionesPorId = $derived(
		new Map(inscripciones.map((i) => [i.id, i]))
	);
	const jugadoresPorId = $derived(new Map(jugadores.map((j) => [j.id, j])));

	// Texto descriptivo de una ref simbolica para mostrar cuando todavia
	// no se puede resolver a una pareja concreta.
	function descripcionRef(ref: typeof partidos[number]['pareja1Ref']): string {
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

	// Lista de nombres (uno por jugador) de cada pareja del partido. Si la
	// ref no se puede resolver a una inscripcion (porque depende de un
	// partido sin resultado), devolvemos el texto descriptivo ("Ganador
	// P1", "1° de Zona C") como UNA linea — asi el bloque nunca queda
	// vacio.
	function nombresParejasPartido(p: Partido): {
		pareja1: string[] | null;
		pareja2: string[] | null;
	} {
		function resolver(ref: typeof p.pareja1Ref): string[] | null {
			if (ref.tipo === 'Inscripcion') {
				const insc = inscripcionesPorId.get(ref.inscripcionId);
				return insc ? nombresJugadores(insc, jugadoresPorId) : null;
			}
			// Pasamos `p.zonaId` como contexto: refs simbolicas de zona DO
			// se resuelven contra partidos de la MISMA zona, no del bracket.
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
			return [descripcionRef(ref)];
		}
		return {
			pareja1: resolver(p.pareja1Ref),
			pareja2: resolver(p.pareja2Ref)
		};
	}

	const zonasPorId = $derived(new Map(zonas.map((z) => [z.id, z])));

	// Etiqueta corta para una ParejaRef en el contexto del partido. Como aca
	// no tenemos inscripciones ni jugadores, mostramos las refs simbolicas
	// directamente — alcanza para identificar el partido en la grilla.
	function labelRef(ref: ParejaRef): string {
		switch (ref.tipo) {
			case 'PosicionZona':
				return `${ref.posicion}°${ref.letraZona}`;
			case 'GanadorPartido':
				return `Gan. P${ref.numeroEnZona}`;
			case 'PerdedorPartido':
				return `Pdr. P${ref.numeroEnZona}`;
			case 'Inscripcion':
				return 'pareja';
		}
	}

	const sedesPorId = $derived(new Map(sedes.map((s) => [s.id, s])));
	const canchasPorId = $derived(new Map(canchasGlobales.map((c) => [c.id, c])));
	const categoriasPorId = $derived(new Map(categorias.map((c) => [c.id, c])));
	const canchasTorneoPorCanchaId = $derived(
		new Map(canchasTorneo.map((tc) => [tc.canchaId, tc]))
	);

	const fechasTorneo = $derived(
		torneo ? rangoFechasInclusivo(torneo.fechaInicio, torneo.fechaFin) : []
	);

	// Etiqueta corta para un partido. Incluye letra de zona (cuando es de
	// zona) o nombre de la fase (cuando es bracket), y el numero del partido.
	function labelPartido(p: Partido): string {
		const cat = categoriasPorId.get(p.categoriaId);
		const catLabel = cat ? nombreCategoria(cat) : 'Categoría ?';
		const ctxLabel = nombreContexto(p);
		return `${catLabel} · ${ctxLabel} · P${p.numeroEnZona}`;
	}

	// Nombre del contexto: "Zona A" para zonas, "Cuartos" / "Semis" / "Final"
	// para bracket.
	function nombreContexto(p: Partido): string {
		if (p.zonaId !== null) {
			const z = zonasPorId.get(p.zonaId);
			return z ? `Zona ${z.letra}` : 'Zona';
		}
		return p.fase;
	}

	function labelCancha(canchaId: string): string {
		const cancha = canchasPorId.get(canchaId);
		const sede = cancha ? sedesPorId.get(cancha.sedeId) : null;
		if (cancha && sede) return `${cancha.nombre} · ${sede.nombre}`;
		return cancha?.nombre ?? 'Cancha desconocida';
	}

	// Etiqueta humana para mostrar programacion.
	function labelProgramacion(prog: ProgramacionPartido): string {
		return `${etiquetaFechaCorta(prog.fecha)} · ${prog.hora} · ${labelCancha(prog.canchaId)}`;
	}

	// Tree de 3 niveles para el listado: Categoria > Zona/Fase > Partidos.
	// Cada nivel intermedio (categoria, zona/fase) precomputa los contadores
	// (total/programados) para mostrarlos en el header sin tener que recorrer
	// hijos al renderizar.
	type GrupoContexto = {
		key: string;
		label: string;
		esZona: boolean;
		total: number;
		programados: number;
		// Ordenamos los partidos por numeroEnZona ascendente.
		partidos: Partido[];
	};

	type GrupoCat = {
		categoriaId: string;
		nombre: string;
		total: number;
		programados: number;
		contextos: GrupoContexto[];
		// Categoria tiene zonas armadas pero el bracket todavia NO. La UI usa
		// este flag para mostrar un link "Armar bracket" — sino el admin no se
		// da cuenta de que faltan los partidos del cuadro final.
		bracketPendiente: boolean;
	};

	// Orden canonico de las fases del bracket. Las fases que no esten aca
	// (por ejemplo en torneos futuros con doceavos) caen al final por
	// localeCompare.
	const FASE_ORDEN = ['32vos', '16vos', '8vos', '4tos', 'Semis', 'Final'];

	function indiceFase(fase: string): number {
		const i = FASE_ORDEN.indexOf(fase);
		return i === -1 ? FASE_ORDEN.length : i;
	}

	// Mismo orden que la pantalla de detalle de torneo: por nivel
	// (1ra → 9na) y dentro del mismo nivel por genero (Caballeros, Damas,
	// Mixto). Asi el listado de programacion es predecible y se navega igual
	// que el resto de la app.
	const categoriasOrdenadas = $derived(
		[...categorias].sort((a, b) => {
			const d = NIVELES_CATEGORIA.indexOf(a.nivel) - NIVELES_CATEGORIA.indexOf(b.nivel);
			if (d !== 0) return d;
			return GENEROS_CATEGORIA.indexOf(a.genero) - GENEROS_CATEGORIA.indexOf(b.genero);
		})
	);

	const grupos = $derived.by<GrupoCat[]>(() => {
		// Indexamos partidos primero por categoria, despues por "contexto"
		// (zonaId si es zona, o fase si es bracket).
		const porCategoria = new Map<string, Map<string, Partido[]>>();
		for (const p of partidos) {
			const ctxKey = p.zonaId !== null ? `zona-${p.zonaId}` : `fase-${p.fase}`;
			const porCtx = porCategoria.get(p.categoriaId) ?? new Map();
			const arr = porCtx.get(ctxKey) ?? [];
			arr.push(p);
			porCtx.set(ctxKey, arr);
			porCategoria.set(p.categoriaId, porCtx);
		}

		const out: GrupoCat[] = [];
		for (const cat of categoriasOrdenadas) {
			const porCtx = porCategoria.get(cat.id);
			if (!porCtx || porCtx.size === 0) continue;

			const contextos: GrupoContexto[] = [];
			for (const [key, lista] of porCtx.entries()) {
				const primero = lista[0]!;
				const esZona = primero.zonaId !== null;
				const label = esZona
					? `Zona ${zonasPorId.get(primero.zonaId!)?.letra ?? '?'}`
					: primero.fase;
				const partidosOrden = [...lista].sort(
					(a, b) => a.numeroEnZona - b.numeroEnZona
				);
				contextos.push({
					key,
					label,
					esZona,
					total: partidosOrden.length,
					programados: partidosOrden.filter((p) => p.programacion).length,
					partidos: partidosOrden
				});
			}
			// Ordenar contextos: zonas primero (por letra A-Z), despues bracket
			// por orden de fase.
			contextos.sort((a, b) => {
				if (a.esZona !== b.esZona) return a.esZona ? -1 : 1;
				if (a.esZona) return a.label.localeCompare(b.label, 'es');
				return indiceFase(a.label) - indiceFase(b.label);
			});

			const total = contextos.reduce((s, c) => s + c.total, 0);
			const programadosG = contextos.reduce((s, c) => s + c.programados, 0);
			// Bracket pendiente: zonas armadas (armadoConfig) pero sin bracket.
			const tieneZonas = (cat.armadoConfig ?? null) !== null;
			const tieneBracket = (cat.bracketConfig ?? null) !== null;
			out.push({
				categoriaId: cat.id,
				nombre: nombreCategoria(cat),
				total,
				programados: programadosG,
				contextos,
				bracketPendiente: tieneZonas && !tieneBracket
			});
		}
		return out;
	});

	// ===== Estado de expansion del tree =====
	let expandidasCat = $state<Record<string, boolean>>({});
	let expandidasCtx = $state<Record<string, boolean>>({});

	function toggleCategoria(catId: string) {
		expandidasCat = { ...expandidasCat, [catId]: !expandidasCat[catId] };
	}

	function toggleContexto(catId: string, ctxKey: string) {
		const k = `${catId}::${ctxKey}`;
		expandidasCtx = { ...expandidasCtx, [k]: !expandidasCtx[k] };
	}

	function ctxKey(catId: string, ctxKey: string): string {
		return `${catId}::${ctxKey}`;
	}

	// Util para expandir / colapsar todo de una sola.
	function expandirTodo() {
		const cat: Record<string, boolean> = {};
		const ctx: Record<string, boolean> = {};
		for (const g of grupos) {
			cat[g.categoriaId] = true;
			for (const c of g.contextos) ctx[`${g.categoriaId}::${c.key}`] = true;
		}
		expandidasCat = cat;
		expandidasCtx = ctx;
	}

	function colapsarTodo() {
		expandidasCat = {};
		expandidasCtx = {};
	}

	// =====
	// Edicion: modal de programacion
	// =====

	let partidoEditandoId = $state<string | null>(null);
	const partidoEditando = $derived(
		partidoEditandoId
			? (partidos.find((p) => p.id === partidoEditandoId) ?? null)
			: null
	);

	// Estado del form en el modal.
	let formFecha = $state<string>('');
	let formHora = $state<string>('');
	let formCanchaId = $state<string>('');
	let guardando = $state(false);

	$effect(() => {
		// Cuando cambia el partido editando, sembrar el form con su programacion
		// actual (o defaults).
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
			formFecha = fechasTorneo[0] ?? '';
			formHora = '10:00';
			formCanchaId = canchasTorneo[0]?.canchaId ?? '';
		}
	});

	const propuesta = $derived<ProgramacionPartido | null>(
		formFecha && formHora && formCanchaId
			? { fecha: formFecha, hora: formHora, canchaId: formCanchaId }
			: null
	);

	// Lista de partidos programados para alimentar el validador (excluyendo
	// el que estoy editando — se valida solo con los otros).
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

	// Mapa de bloqueos por inscripcionId, derivado de todas las inscripciones
	// de TODAS las categorias del torneo. El validador lo usa para descartar
	// horarios en los que algun jugador de la pareja declaro que no puede.
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

	function abrirEdicion(pid: string) {
		partidoEditandoId = pid;
	}

	function cerrarEdicion() {
		partidoEditandoId = null;
	}

	async function guardar() {
		if (!partidoEditando || !propuesta) return;
		// Los conflictos no bloquean — son advertencias para el organizador.
		// El admin puede decidir igualmente (override manual con criterio).
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

	// Stats: cuantos partidos programados / total.
	const totalPartidos = $derived(partidos.length);
	const programadosCount = $derived(
		partidos.filter((p) => p.programacion).length
	);

	// =====
	// Sugerencia automatica
	// =====

	let sheetSugerencia = $state(false);
	type ModoSugerencia = 'pendientes' | 'reasignar';
	let modoSugerencia = $state<ModoSugerencia>('pendientes');
	let resultadoSugerencia = $state<{
		asignaciones: Asignacion[];
		sinProgramar: string[];
	} | null>(null);
	let aplicandoSugerencia = $state(false);

	function recalcularSugerencia(modo: ModoSugerencia) {
		const reasignar = modo === 'reasignar';
		const sinProgramar: PartidoParaSugerir[] = partidos
			.filter((p) => (reasignar ? true : !p.programacion))
			.map((p) => ({
				id: p.id,
				categoriaId: p.categoriaId,
				esZona: p.zonaId !== null,
				ronda: p.ronda,
				numeroEnZona: p.numeroEnZona,
				letraZona:
					p.zonaId !== null
						? (zonas.find((z) => z.id === p.zonaId)?.letra ?? undefined)
						: undefined,
				parejas: parejasPotencialesDePartido(p),
				partidosPadre: partidosAncestrosDirectos(p, partidos, zonas)
			}));
		const yaProgramados: PartidoProgramado[] = reasignar
			? []
			: partidos
					.filter((p) => p.programacion)
					.map((p) => ({
						id: p.id,
						programacion: p.programacion!,
						label: labelPartido(p),
						parejas: parejasPotencialesDePartido(p)
					}));
		// Pre-ordenar canchas por nombre natural (Cancha 1, 2, 3, ... 10).
		// El greedy desempata slots con misma fecha+hora respetando el orden
		// que recibe — asi recorre las canchas en orden visible al usuario.
		const colator = new Intl.Collator(undefined, {
			numeric: true,
			sensitivity: 'base'
		});
		const canchasTorneoOrdenadas = [...canchasTorneo].sort((a, b) => {
			const nA = canchasPorId.get(a.canchaId)?.nombre ?? a.canchaId;
			const nB = canchasPorId.get(b.canchaId)?.nombre ?? b.canchaId;
			return colator.compare(nA, nB);
		});
		resultadoSugerencia = sugerirProgramacion({
			partidosSinProgramar: sinProgramar,
			partidosYaProgramados: yaProgramados,
			canchasTorneo: canchasTorneoOrdenadas,
			bloqueosPorPareja
		});
	}

	function abrirSugerencia() {
		modoSugerencia = 'pendientes';
		recalcularSugerencia('pendientes');
		sheetSugerencia = true;
	}

	function cambiarModo(modo: ModoSugerencia) {
		modoSugerencia = modo;
		recalcularSugerencia(modo);
	}

	async function aplicarSugerencia() {
		if (!resultadoSugerencia) return;
		aplicandoSugerencia = true;
		try {
			const catPorPartido = new Map(
				partidos.map((p) => [p.id, p.categoriaId])
			);
			const payload = resultadoSugerencia.asignaciones
				.map((a) => ({
					partidoId: a.partidoId,
					categoriaId: catPorPartido.get(a.partidoId)!,
					programacion: a.programacion
				}))
				.filter((a) => a.categoriaId);
			// En modo "reasignar", los partidos que tenian programacion vieja
			// y NO se les pudo asignar slot nuevo, hay que limpiarlos. Sino
			// quedarian con la vieja distribucion (potencialmente conflictiva).
			let aLimpiar: { partidoId: string; categoriaId: string }[] = [];
			if (modoSugerencia === 'reasignar') {
				const asignadosSet = new Set(payload.map((a) => a.partidoId));
				aLimpiar = partidos
					.filter((p) => p.programacion && !asignadosSet.has(p.id))
					.map((p) => ({ partidoId: p.id, categoriaId: p.categoriaId }));
			}
			await aplicarAsignacionesSugeridas(id, payload, aLimpiar);
			sheetSugerencia = false;
			resultadoSugerencia = null;
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Error al aplicar');
		} finally {
			aplicandoSugerencia = false;
		}
	}

	const partidosSinProgramarCount = $derived(totalPartidos - programadosCount);

	// =====
	// Vista: Lista (tree) o Grilla (visual)
	// =====
	type VistaId = 'lista' | 'grilla';
	let vistaActiva = $state<VistaId>('lista');

	// Fecha activa para la grilla. Por default la primera del torneo.
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

	// =====
	// Colores por categoria (paleta cíclica con hash determinista)
	// =====
	const PALETA_CAT: { bg: string; fg: string }[] = [
		{ bg: '#dcfce7', fg: '#166534' }, // verde
		{ bg: '#dbeafe', fg: '#1e40af' }, // azul
		{ bg: '#fef3c7', fg: '#92400e' }, // amber
		{ bg: '#fee2e2', fg: '#991b1b' }, // rojo
		{ bg: '#f3e8ff', fg: '#6b21a8' }, // violeta
		{ bg: '#cffafe', fg: '#155e75' }, // cyan
		{ bg: '#ffedd5', fg: '#9a3412' }, // naranja
		{ bg: '#fce7f3', fg: '#9d174d' } // rosa
	];

	// Mapeo deterministico por ORDEN de aparicion en categoriasOrdenadas.
	// Esto garantiza que las primeras 8 categorias tengan colores distintos
	// (si fueran mas de 8, se cicla). Mucho mas predecible que un hash.
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

	// =====
	// Filtro por categoría (chips)
	// =====
	let filtroCategoriasIds = $state<Set<string>>(new Set());

	function toggleFiltroCategoria(catId: string) {
		const next = new Set(filtroCategoriasIds);
		if (next.has(catId)) next.delete(catId);
		else next.add(catId);
		filtroCategoriasIds = next;
	}

	function labelPartidoCorto(p: Partido): string {
		return `${nombreContexto(p)} · P${p.numeroEnZona}`;
	}
</script>

<div class="mx-auto max-w-4xl p-4 sm:p-6">
	{#if cargando}
		<div class="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500">
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
		</div>
	{:else if !torneo}
		<div class="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-400">
			No se encontró el torneo.
		</div>
	{:else}
		<a
			href={`/torneos/${id}`}
			class="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
		>
			<i class="bi bi-arrow-left"></i>
			Volver
		</a>

		<BreadcrumbCard items={[{ prefijo: 'Torneo', label: torneo.nombre }]} />

		<header class="mb-4 flex items-center justify-between gap-3">
			<div class="flex items-center gap-2">
				<h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">Programación</h1>
				{#if totalPartidos > 0}
					<span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
						{programadosCount}/{totalPartidos}
					</span>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				{#if totalPartidos > 0 && canchasTorneo.length > 0}
					<a
						href={`/torneos/${id}/programacion/grilla`}
						title="Abrir vista grilla"
						class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
					>
						<i class="bi bi-grid-3x3-gap"></i>
						<span class="hidden sm:inline">Vista grilla</span>
					</a>
					<button
						type="button"
						onclick={abrirSugerencia}
						title="Sugerir programación automática"
						class="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
					>
						<i class="bi bi-magic"></i>
						Sugerir
					</button>
				{/if}
			</div>
		</header>

		{#if canchasTorneo.length === 0}
			<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
				<p class="flex items-center gap-1.5 font-medium">
					<i class="bi bi-info-circle"></i>
					Asigná canchas primero
				</p>
				<p class="mt-1">
					Sin canchas no se puede programar.
					<a href={`/torneos/${id}/canchas`} class="font-medium underline">Ir a Canchas →</a>
				</p>
			</div>
		{:else if totalPartidos === 0}
			<div class="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
				<i class="bi bi-calendar3 text-4xl text-gray-300 dark:text-gray-600"></i>
				<p class="mt-3 font-medium">No hay partidos generados</p>
				<p class="text-sm">Armá zonas en alguna categoría para empezar a programar.</p>
			</div>
		{:else}
			<!-- Acciones del tree. -->
			<div class="mb-3 flex items-center gap-2 text-xs">
				<button
					type="button"
					onclick={expandirTodo}
					class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
				>
					<i class="bi bi-chevron-double-down"></i>
					Expandir todo
				</button>
				<button
					type="button"
					onclick={colapsarTodo}
					class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
				>
					<i class="bi bi-chevron-double-up"></i>
					Colapsar todo
				</button>
			</div>

			<!-- Tree de 3 niveles: Categoria > Zona/Fase > Partidos. -->
			<div class="flex flex-col gap-1">
				{#each grupos as g (g.categoriaId)}
					{@const catAbierta = expandidasCat[g.categoriaId] ?? false}
					{@const catCompleta = g.programados === g.total}
					<div class="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
						<!-- Nivel 1: Categoria -->
						<button
							type="button"
							onclick={() => toggleCategoria(g.categoriaId)}
							class="flex w-full items-center gap-2 px-2 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
						>
							<span class="w-4 shrink-0 text-center text-xs text-gray-400 dark:text-gray-500">
								{catAbierta ? '▼' : '▶'}
							</span>
							<span class="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
								{g.nombre}
							</span>
							<span
								class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold {catCompleta
									? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
									: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}"
							>
								{g.programados}/{g.total}
							</span>
						</button>

						{#if g.bracketPendiente}
							<!-- Aviso: zonas armadas pero falta armar el bracket. -->
							<div
								class="mx-2 mb-2 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
							>
								<i class="bi bi-info-circle shrink-0"></i>
								<span class="flex-1">
									El bracket eliminatorio todavía no está armado. Los partidos del cuadro
									final no aparecen acá.
								</span>
								<a
									href={`/torneos/${id}/categorias/${g.categoriaId}/bracket`}
									class="shrink-0 rounded-md bg-amber-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-amber-700"
								>
									Armar
								</a>
							</div>
						{/if}

						{#if catAbierta}
							<div class="flex flex-col gap-0.5 border-t border-gray-100 px-1 pb-2 dark:border-gray-800">
								{#each g.contextos as c (c.key)}
									{@const ctxAbierto = expandidasCtx[ctxKey(g.categoriaId, c.key)] ?? false}
									{@const ctxCompleto = c.programados === c.total}
									<div>
										<!-- Nivel 2: Zona / Fase -->
										<button
											type="button"
											onclick={() => toggleContexto(g.categoriaId, c.key)}
											class="ml-2 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
										>
											<span class="w-4 shrink-0 text-center text-xs text-gray-400 dark:text-gray-500">
												{ctxAbierto ? '▼' : '▶'}
											</span>
											<span class="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
												{c.label}
											</span>
											<span
												class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold {ctxCompleto
													? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
													: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}"
											>
												{c.programados}/{c.total}
											</span>
										</button>

										{#if ctxAbierto}
											<ul class="ml-6 mt-0.5 mb-1 flex flex-col gap-0.5">
												{#each c.partidos as p (p.id)}
													{@const prog = p.programacion}
													<li>
														<button
															type="button"
															onclick={() => abrirEdicion(p.id)}
															class="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
														>
															<span
																class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold {prog
																	? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
																	: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}"
															>
																P{p.numeroEnZona}
															</span>
															<div class="min-w-0 flex-1">
																{#if prog}
																	<p class="truncate text-xs text-gray-700 dark:text-gray-300">
																		{labelProgramacion(prog)}
																	</p>
																{:else}
																	<p class="truncate text-xs text-gray-400 italic dark:text-gray-500">
																		Sin programar
																	</p>
																{/if}
															</div>
															<i class="bi bi-chevron-right shrink-0 text-xs text-gray-300 dark:text-gray-600"></i>
														</button>
													</li>
												{/each}
											</ul>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<!-- Sheet de sugerencia automatica. -->
<BottomSheet
	open={sheetSugerencia}
	onClose={() => (sheetSugerencia = false)}
	title="Sugerir programación"
>
	{#if resultadoSugerencia}
		<!-- Toggle de modo. -->
		<div class="mb-3 flex w-full items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
			<button
				type="button"
				onclick={() => cambiarModo('pendientes')}
				aria-pressed={modoSugerencia === 'pendientes'}
				class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition {modoSugerencia ===
				'pendientes'
					? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:text-brand-300'
					: 'bg-transparent font-medium text-gray-500 dark:text-gray-400'}"
			>
				<i class="bi bi-plus-circle"></i>
				Solo pendientes
			</button>
			<button
				type="button"
				onclick={() => cambiarModo('reasignar')}
				aria-pressed={modoSugerencia === 'reasignar'}
				class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition {modoSugerencia ===
				'reasignar'
					? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:text-brand-300'
					: 'bg-transparent font-medium text-gray-500 dark:text-gray-400'}"
			>
				<i class="bi bi-arrow-repeat"></i>
				Reasignar todo
			</button>
		</div>

		<p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
			{#if modoSugerencia === 'pendientes'}
				Asigna solo los partidos sin programar. Los ya programados no se tocan.
			{:else}
				Borra la distribución actual y vuelve a calcular todo desde cero. Útil para
				arreglar choques que quedaron de una distribución anterior.
			{/if}
		</p>

		<div class="mb-4 grid grid-cols-2 gap-3">
			<div class="rounded-lg border border-brand-200 bg-brand-50 p-3 text-center dark:border-brand-700 dark:bg-brand-900/40">
				<p class="text-3xl font-bold text-brand-700 dark:text-brand-300">
					{resultadoSugerencia.asignaciones.length}
				</p>
				<p class="mt-0.5 text-xs font-medium text-brand-700 dark:text-brand-300">
					Se asignan
				</p>
			</div>
			<div class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-800 dark:bg-gray-800/50">
				<p class="text-3xl font-bold text-gray-700 dark:text-gray-300">
					{resultadoSugerencia.sinProgramar.length}
				</p>
				<p class="mt-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
					Sin slot
				</p>
			</div>
		</div>

		{#if resultadoSugerencia.sinProgramar.length > 0}
			<div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
				<p class="flex items-center gap-1.5 font-semibold">
					<i class="bi bi-info-circle"></i>
					{resultadoSugerencia.sinProgramar.length}
					{resultadoSugerencia.sinProgramar.length === 1 ? 'partido' : 'partidos'} sin slot disponible.
				</p>
				<p class="mt-1">
					Ampliá la disponibilidad de canchas o agregá más canchas para que entren todos.
				</p>
			</div>
		{/if}

		{#if resultadoSugerencia.asignaciones.length > 0}
			<details class="mb-4 rounded-lg border border-gray-200 dark:border-gray-800">
				<summary class="cursor-pointer px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
					Ver detalle
				</summary>
				<ul class="max-h-64 space-y-1 overflow-y-auto border-t border-gray-100 p-2 text-xs dark:border-gray-800">
					{#each resultadoSugerencia.asignaciones as a (a.partidoId)}
						{@const p = partidos.find((pp) => pp.id === a.partidoId)}
						<li class="flex items-start gap-2 rounded-md bg-gray-50 px-2 py-1.5 dark:bg-gray-800/50">
							<span class="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
								{p ? labelPartido(p) : a.partidoId}
							</span>
							<span class="shrink-0 font-mono text-gray-600 dark:text-gray-400">
								{a.programacion.fecha.slice(5)} · {a.programacion.hora}
							</span>
						</li>
					{/each}
				</ul>
			</details>
		{/if}

		<div class="mt-5 flex items-center justify-end gap-3">
			<button
				type="button"
				onclick={() => (sheetSugerencia = false)}
				disabled={aplicandoSugerencia}
				class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
			>
				Cancelar
			</button>
			<button
				type="button"
				onclick={aplicarSugerencia}
				disabled={aplicandoSugerencia || resultadoSugerencia.asignaciones.length === 0}
				class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if aplicandoSugerencia}
					<i class="bi bi-arrow-clockwise animate-spin"></i>
				{/if}
				Aplicar
			</button>
		</div>
	{/if}
</BottomSheet>

<!-- Sheet de programacion del partido. -->
<BottomSheet
	open={partidoEditando !== null}
	onClose={cerrarEdicion}
	title={partidoEditando?.programacion ? 'Editar programación' : 'Programar partido'}
>
	{#if partidoEditando}
		<p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
			{labelPartido(partidoEditando)}
		</p>

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
</BottomSheet>
