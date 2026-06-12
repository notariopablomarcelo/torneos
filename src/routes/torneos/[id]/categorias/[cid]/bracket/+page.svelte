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
		guardarOverrideBracket,
		resolverParejaRefBracket
	} from '$lib/services/bracket';
	import {
		armarBracketDesdeSlots,
		slotsDeBracket,
		type PartidoBracketPlantilla
	} from '$lib/bracket/algoritmo';
	import { calcularTablaPosiciones, estadoZona } from '$lib/zonas/resultados';
	import { AMBIENTE } from '$lib/firebase';
	import { generarResultadoPartido } from '$lib/dev/factories';
	import {
		nombreCategoria,
		type Categoria,
		type Torneo
	} from '$lib/types/torneo';
	import {
		generarPreviewEstructura,
		generarPreviewEstructuraCustom,
		type PartidoBracketPreview
	} from '$lib/preview/estructura';
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
		// Reset de estado de UI al cambiar de categoria.
		rondaActivaManual = null;
		vistaCuadro = 'lista';
		cuadroExpandido = false;
		// Cerrar editor en curso — si quedaba abierto, sus slotsEdit son de
		// la categoria anterior; guardar dispararia armado con datos viejos.
		modoEdicion = false;
		slotsEdit = [];
		seleccionSlot = null;
		modoEditorFuente = 'armado';
		guardando = false;
		partidoEditandoId = null;
		cuadroModal = false;

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
	// pero la categoria tiene estructura definida (custom o simple) + cupos.
	// Custom prevalece sobre simple si ambas estan presentes.
	const previewBracketCustom = $derived.by(() => {
		if (zonasArmadas) return null;
		const grupos = categoria?.estructuraPersonalizada;
		if (!grupos || grupos.length === 0) return null;
		const est = generarPreviewEstructuraCustom(
			grupos,
			categoria?.bracketSlotsOverride ?? null
		);
		return est && est.bracket.length > 0 ? est : null;
	});
	const previewBracket = $derived.by(() => {
		if (zonasArmadas) return null;
		if (previewBracketCustom) return null;
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
			categoria.clasificanPorZona,
			categoria.bracketSlotsOverride ?? null
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

	// Codigos cortos por partido del bracket armado: "16-1", "8-3", "S1", "F"
	// (Final). Misma logica que el preview — numera dentro de cada fase en
	// orden de aparicion (ronda, luego posicionEnRonda). Lo usamos como chip
	// de identificacion en la vista cuadro.
	const codigosArmado = $derived.by(() => {
		const m = new Map<string, string>();
		const contador = new Map<string, number>();
		const ordenados = [...partidosBracket].sort((a, b) => {
			if ((a.ronda ?? 0) !== (b.ronda ?? 0))
				return (a.ronda ?? 0) - (b.ronda ?? 0);
			return (a.posicionEnRonda ?? 0) - (b.posicionEnRonda ?? 0);
		});
		for (const p of ordenados) {
			if (p.fase === 'Final') {
				m.set(p.id, 'F');
				continue;
			}
			const n = (contador.get(p.fase ?? '') ?? 0) + 1;
			contador.set(p.fase ?? '', n);
			let prefijo: string;
			switch (p.fase) {
				case '32vos':
					prefijo = '32-';
					break;
				case '16vos':
					prefijo = '16-';
					break;
				case '8vos':
					prefijo = '8-';
					break;
				case '4tos':
					prefijo = '4-';
					break;
				case 'Semis':
					prefijo = 'S';
					break;
				default:
					prefijo = '';
			}
			m.set(p.id, `${prefijo}${n}`);
		}
		return m;
	});

	// Modo de visualizacion: 'lista' (tabs por ronda, una ronda a la vez)
	// o 'cuadro' (estilo Roland Garros, todas las rondas en columnas con
	// scroll horizontal). Aplica tanto al bracket real como al preview.
	let vistaCuadro = $state<'lista' | 'cuadro'>('lista');

	// Tamaño de las cards del cuadro: false = compacto (220px, fuente chica),
	// true = expandido (320px, fuente mas grande). Solo aplica a la vista
	// cuadro. Util en desktop para leer sin scrollear tanto.
	let cuadroExpandido = $state(false);

	// Modo modal: el cuadro editor se levanta en un overlay full-screen
	// para aprovechar todo el viewport. Solo aplica en modo edicion.
	let cuadroModal = $state(false);

	// El full-bleed del cuadro (escapar del max-w-4xl) NO aplica dentro
	// del modal — ahi el contenedor mismo ya cubre el viewport.
	const aplicarFullBleed = $derived(cuadroExpandido && !cuadroModal);

	// Body scroll lock mientras el modal este abierto.
	$effect(() => {
		if (cuadroModal && typeof document !== 'undefined') {
			const prev = document.body.style.overflow;
			document.body.style.overflow = 'hidden';
			return () => {
				document.body.style.overflow = prev;
			};
		}
	});

	// ===== Preview: agrupado por ronda y helpers de refs simbolicas =====
	//
	// Elegimos el preview activo: custom prevalece sobre simple.
	const previewActivo = $derived(previewBracketCustom ?? previewBracket);

	// Map numero → codigo corto. Lo usamos para resolver "Ganador 8-1" y
	// "Perdedor 8-1" desde las refs.
	const codigosPreview = $derived.by(() => {
		const m = new Map<number, string>();
		if (!previewActivo) return m;
		for (const p of previewActivo.bracket) m.set(p.numero, p.codigo);
		return m;
	});

	type RondaGrupoPreview = {
		ronda: number;
		fase: string;
		partidos: PartidoBracketPreview[];
	};

	const rondasPreview = $derived.by<RondaGrupoPreview[]>(() => {
		if (!previewActivo) return [];
		const map = new Map<number, PartidoBracketPreview[]>();
		for (const p of previewActivo.bracket) {
			const arr = map.get(p.ronda) ?? [];
			arr.push(p);
			map.set(p.ronda, arr);
		}
		return Array.from(map.entries())
			.sort((a, b) => a[0] - b[0])
			.map(([ronda, partidos]) => ({
				ronda,
				fase: partidos[0]?.fase ?? '',
				partidos
			}));
	});

	// Etiqueta corta para mostrar al lado de la ref (chip mono).
	// PosicionZona → "A1", "B2". Ganador/Perdedor → codigo del partido
	// ("8-1", "S1") o "F" si el partido referido es la final (codigo "").
	function origenPreview(ref: ParejaRef): string | null {
		if (ref.tipo === 'PosicionZona') {
			return `${ref.letraZona}${ref.posicion}`;
		}
		if (ref.tipo === 'GanadorPartido' || ref.tipo === 'PerdedorPartido') {
			const c = codigosPreview.get(ref.numeroEnZona);
			return c === undefined ? null : c === '' ? 'F' : c;
		}
		return null;
	}

	// Descripcion textual para mostrar como "nombre" en la card del preview.
	function nombrePreview(ref: ParejaRef): string {
		if (ref.tipo === 'PosicionZona') {
			return `${ref.posicion}° de Zona ${ref.letraZona}`;
		}
		if (ref.tipo === 'GanadorPartido') {
			const c = codigosPreview.get(ref.numeroEnZona);
			return `Ganador ${c === '' ? 'Final' : (c ?? `P${ref.numeroEnZona}`)}`;
		}
		if (ref.tipo === 'PerdedorPartido') {
			const c = codigosPreview.get(ref.numeroEnZona);
			return `Perdedor ${c === '' ? 'Final' : (c ?? `P${ref.numeroEnZona}`)}`;
		}
		return '?';
	}

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

	// ===== Editor de cruces custom =====
	//
	// Modo edicion: el organizador puede swappear refs entre slots de R1
	// (incluyendo slots vacios = byes) y guardar. Al guardar, se re-arma el
	// cuadro entero desde el override y se BORRAN los resultados previos.

	let modoEdicion = $state(false);
	// 'armado' = editor sobre bracket real (re-arma al guardar).
	// 'preview' = editor sobre preview (solo guarda override, no arma nada).
	let modoEditorFuente = $state<'armado' | 'preview'>('armado');
	let slotsEdit = $state<(ParejaRef | null)[]>([]);
	let seleccionSlot = $state<number | null>(null);
	let guardando = $state(false);

	function abrirEditor() {
		if (modoEdicion) return; // ya esta abierto: no descartar cambios en curso.
		// Derivar slots desde los partidos del bracket armado.
		const partidosBracketPlantilla = partidosBracket.map((p) => ({
			numeroEnZona: p.numeroEnZona,
			pareja1Ref: p.pareja1Ref,
			pareja2Ref: p.pareja2Ref,
			ronda: p.ronda ?? 1,
			posicionEnRonda: p.posicionEnRonda ?? 1,
			fase: (p.fase ?? 'Final') as
				| '32vos'
				| '16vos'
				| '8vos'
				| '4tos'
				| 'Semis'
				| 'Final'
		}));
		slotsEdit = slotsDeBracket(partidosBracketPlantilla);
		seleccionSlot = null;
		modoEditorFuente = 'armado';
		vistaCuadro = 'cuadro';
		modoEdicion = true;
	}

	function abrirEditorPreview() {
		if (modoEdicion) return;
		// Slots desde el preview activo (custom o simple). Si la categoria
		// ya tiene override, el preview lo refleja → slotsDeBracket sobre
		// preview.bracket trae el mismo override.
		const preview = previewBracketCustom ?? previewBracket;
		if (!preview) return;
		const partidosPlantilla = preview.bracket.map((p) => ({
			numeroEnZona: p.numero,
			pareja1Ref: p.pareja1Ref,
			pareja2Ref: p.pareja2Ref,
			ronda: p.ronda,
			posicionEnRonda: p.posicionEnRonda,
			fase: p.fase
		}));
		slotsEdit = slotsDeBracket(partidosPlantilla);
		seleccionSlot = null;
		modoEditorFuente = 'preview';
		vistaCuadro = 'cuadro';
		modoEdicion = true;
	}

	function cerrarEditor() {
		modoEdicion = false;
		seleccionSlot = null;
		slotsEdit = [];
		cuadroModal = false;
	}

	function clickSlotEdit(idx: number) {
		if (seleccionSlot === null) {
			seleccionSlot = idx;
		} else if (seleccionSlot === idx) {
			seleccionSlot = null;
		} else {
			const nuevo = [...slotsEdit];
			const tmp = nuevo[seleccionSlot] ?? null;
			nuevo[seleccionSlot] = nuevo[idx] ?? null;
			nuevo[idx] = tmp;
			slotsEdit = nuevo;
			seleccionSlot = null;
		}
	}

	async function handleGuardarEditor() {
		const cantParejas = slotsEdit.filter((r) => r !== null).length;
		if (cantParejas < 2) {
			alert('Debe haber al menos 2 parejas en el cuadro.');
			return;
		}
		// En modo preview no hay bracket que rearmar — solo guardamos el
		// override; se usara cuando se arme el bracket real mas adelante.
		if (modoEditorFuente === 'preview') {
			guardando = true;
			try {
				await guardarOverrideBracket(tid, cid, slotsEdit);
				categoria = await obtenerCategoria(tid, cid);
				cerrarEditor();
			} catch (err) {
				alert(err instanceof Error ? err.message : 'Error al guardar.');
			} finally {
				guardando = false;
			}
			return;
		}
		const ok = confirm(
			'Guardar va a re-armar el cuadro con los cruces editados y BORRAR los resultados cargados. ¿Continuar?'
		);
		if (!ok) return;
		guardando = true;
		try {
			await armarBracketCategoria(tid, cid, zonas, slotsEdit);
			categoria = await obtenerCategoria(tid, cid);
			cerrarEditor();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Error al guardar.');
		} finally {
			guardando = false;
		}
	}

	async function handleResetSnake() {
		const mensaje = modoEditorFuente === 'armado'
			? 'Reset al sembrado snake: descarta los cambios manuales, vuelve al armado automatico y BORRA los resultados cargados. ¿Continuar?'
			: 'Reset al sembrado snake: descarta los cambios manuales y vuelve al armado automatico. ¿Continuar?';
		const ok = confirm(mensaje);
		if (!ok) return;
		guardando = true;
		try {
			if (modoEditorFuente === 'preview') {
				await guardarOverrideBracket(tid, cid, null);
			} else {
				await armarBracketCategoria(tid, cid, zonas, null);
			}
			categoria = await obtenerCategoria(tid, cid);
			cerrarEditor();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Error al resetear.');
		} finally {
			guardando = false;
		}
	}

	// ===== Editor VISUAL: bracket virtual derivado de slotsEdit =====
	//
	// En cada cambio del override (swap de slots), re-armo el bracket entero
	// y lo re-renderizo. El usuario ve los conectores y refs de R2+ actualizarse
	// en vivo — para que tome decisiones viendo todas las consecuencias.

	const bracketEditando = $derived.by(() => {
		if (!modoEdicion || slotsEdit.length === 0) return null;
		try {
			return armarBracketDesdeSlots(slotsEdit);
		} catch {
			return null;
		}
	});

	const rondasEditando = $derived.by<
		{ ronda: number; fase: string; partidos: PartidoBracketPlantilla[] }[]
	>(() => {
		if (!bracketEditando) return [];
		const map = new Map<number, PartidoBracketPlantilla[]>();
		for (const p of bracketEditando.partidos) {
			const arr = map.get(p.ronda) ?? [];
			arr.push(p);
			map.set(p.ronda, arr);
		}
		return Array.from(map.entries())
			.sort((a, b) => a[0] - b[0])
			.map(([ronda, partidos]) => ({
				ronda,
				fase: partidos[0]?.fase ?? '',
				partidos
			}));
	});

	const codigosEditando = $derived.by(() => {
		const m = new Map<number, string>();
		if (!bracketEditando) return m;
		const contador = new Map<string, number>();
		const ordenados = [...bracketEditando.partidos].sort((a, b) => {
			if (a.ronda !== b.ronda) return a.ronda - b.ronda;
			return a.numeroEnZona - b.numeroEnZona;
		});
		for (const p of ordenados) {
			if (p.fase === 'Final') {
				m.set(p.numeroEnZona, 'F');
				continue;
			}
			const n = (contador.get(p.fase ?? '') ?? 0) + 1;
			contador.set(p.fase ?? '', n);
			let prefijo: string;
			switch (p.fase) {
				case '32vos':
					prefijo = '32-';
					break;
				case '16vos':
					prefijo = '16-';
					break;
				case '8vos':
					prefijo = '8-';
					break;
				case '4tos':
					prefijo = '4-';
					break;
				case 'Semis':
					prefijo = 'S';
					break;
				default:
					prefijo = '';
			}
			m.set(p.numeroEnZona, `${prefijo}${n}`);
		}
		return m;
	});

	// Slots conceptuales por ronda: slotsPorRonda[0] = slotsEdit (R1).
	// slotsPorRonda[r] tiene 2^(rondas - r) slots. Cada slot R2+ es:
	//  - GanadorPartido si el par R-1 tenia ambas refs (hubo partido);
	//  - la ref directa si solo uno de los dos slots R-1 tenia ref (bye);
	//  - null si ambos eran null (se propaga vacio).
	// Util para detectar pares R2+ que NO tienen partido y dibujar cards
	// "fantasma" — asi el usuario ve a donde sube cada ref por bye.
	const slotsPorRonda = $derived.by<(ParejaRef | null)[][]>(() => {
		if (slotsEdit.length === 0) return [];
		const partidos = bracketEditando?.partidos ?? [];
		const resultado: (ParejaRef | null)[][] = [slotsEdit];
		let entrantes: (ParejaRef | null)[] = slotsEdit;
		let nroRonda = 1;
		while (entrantes.length > 1) {
			const saliente: (ParejaRef | null)[] = [];
			for (let i = 0; i < entrantes.length; i += 2) {
				const a = entrantes[i] ?? null;
				const b = entrantes[i + 1] ?? null;
				if (a && b) {
					const partido = partidos.find(
						(p) => p.ronda === nroRonda && p.posicionEnRonda === i / 2 + 1
					);
					saliente.push(
						partido
							? { tipo: 'GanadorPartido', numeroEnZona: partido.numeroEnZona }
							: null
					);
				} else if (a) {
					saliente.push(a);
				} else if (b) {
					saliente.push(b);
				} else {
					saliente.push(null);
				}
			}
			resultado.push(saliente);
			entrantes = saliente;
			nroRonda += 1;
		}
		return resultado;
	});

	// Mapeo ref → slot index dentro de slotsEdit. Solo PosicionZona e
	// Inscripcion estan persistidas como slots; Ganador/Perdedor son derivadas.
	function slotDeRef(ref: ParejaRef): number | null {
		for (let i = 0; i < slotsEdit.length; i++) {
			const s = slotsEdit[i];
			if (!s) continue;
			if (s.tipo !== ref.tipo) continue;
			if (
				s.tipo === 'PosicionZona' &&
				ref.tipo === 'PosicionZona' &&
				s.letraZona === ref.letraZona &&
				s.posicion === ref.posicion
			)
				return i;
			if (
				s.tipo === 'Inscripcion' &&
				ref.tipo === 'Inscripcion' &&
				s.inscripcionId === ref.inscripcionId
			)
				return i;
		}
		return null;
	}

	function clickRefEdit(ref: ParejaRef) {
		// Solo refs base son editables. GanadorPartido/PerdedorPartido son
		// derivadas — no hacen nada al clickear.
		if (ref.tipo !== 'PosicionZona' && ref.tipo !== 'Inscripcion') return;
		const idx = slotDeRef(ref);
		if (idx === null) return;
		clickSlotEdit(idx);
	}

	// Para el render: ¿esta esta ref actualmente seleccionada?
	// Comparamos por slot index (no por JSON.stringify) — mas robusto ante
	// duplicados o clones con orden de claves distinto.
	function esSeleccionada(ref: ParejaRef): boolean {
		if (seleccionSlot === null) return false;
		return slotDeRef(ref) === seleccionSlot;
	}

	// Helpers reutilizados desde el snippet cuadroEditarRender. Aceptan null
	// (= slot Bye libre) para soportar render uniforme de R1 con todos los
	// slots — incluidos los vacios — como cards seleccionables.
	function origenDeRefEditando(ref: ParejaRef | null): string {
		if (!ref) return '—';
		if (ref.tipo === 'PosicionZona') return `${ref.letraZona}${ref.posicion}`;
		if (ref.tipo === 'GanadorPartido' || ref.tipo === 'PerdedorPartido')
			return codigosEditando.get(ref.numeroEnZona) ?? '';
		return '';
	}

	function nombreDeRefEditando(ref: ParejaRef | null): string {
		if (!ref) return 'Bye libre';
		if (ref.tipo === 'PosicionZona') return `${ref.posicion}° de Zona ${ref.letraZona}`;
		if (ref.tipo === 'GanadorPartido') {
			const c = codigosEditando.get(ref.numeroEnZona);
			return `Ganador ${c === '' ? 'Final' : (c ?? `P${ref.numeroEnZona}`)}`;
		}
		if (ref.tipo === 'PerdedorPartido') {
			const c = codigosEditando.get(ref.numeroEnZona);
			return `Perdedor ${c === '' ? 'Final' : (c ?? `P${ref.numeroEnZona}`)}`;
		}
		if (ref.tipo === 'Inscripcion') {
			const insc = inscripcionesPorId.get(ref.inscripcionId);
			return insc ? nombreInscripcion(insc, jugadoresPorId) : 'Pareja';
		}
		return '?';
	}

	// Texto descriptivo de la ref seleccionada (para el overlay).
	const textoSeleccion = $derived.by(() => {
		if (seleccionSlot === null) return null;
		return nombreDeRefEditando(slotsEdit[seleccionSlot] ?? null);
	});

	// Helpers para mostrar las refs en el editor.
	function origenSlot(ref: ParejaRef | null): string {
		if (ref === null) return '—';
		if (ref.tipo === 'PosicionZona') return `${ref.letraZona}${ref.posicion}`;
		if (ref.tipo === 'Inscripcion') return 'I';
		return '?';
	}

	function descSlot(ref: ParejaRef | null): string {
		if (ref === null) return 'Bye (slot vacio)';
		if (ref.tipo === 'PosicionZona') {
			return `${ref.posicion}° de Zona ${ref.letraZona}`;
		}
		if (ref.tipo === 'Inscripcion') {
			const insc = inscripcionesPorId.get(ref.inscripcionId);
			return insc ? nombreInscripcion(insc, jugadoresPorId) : 'Inscripcion';
		}
		return '?';
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
			{#if bracketArmado && !modoEdicion}
				<KebabMenu
					label="Acciones del cuadro final"
					items={[
						{
							label: 'Editar cruces',
							icono: 'bi-pencil-square',
							onClick: abrirEditor
						},
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
			{#if previewBracketCustom}
				<!-- Vista previa basada en la estructura PERSONALIZADA: grupos
				     heterogeneos. Se etiqueta cada grupo con las letras de zona
				     que cae adentro (A, B, ... segun orden). -->
				{@const grp = previewBracketCustom}
				<div class="mb-3 flex items-start gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
					<i class="bi bi-eye mt-0.5 text-base text-gray-500 dark:text-gray-400"></i>
					<div class="flex-1">
						<p class="font-semibold">Vista previa (configuración personalizada)</p>
						<p class="opacity-80">
							Estructura del cuadro final basada en {grp.cantidadZonas}
							{grp.cantidadZonas === 1 ? 'zona' : 'zonas'} y {grp.totalParejas}
							parejas. Las posiciones reales se resuelven al terminar las zonas.
						</p>
						<ul class="mt-1.5 space-y-0.5">
							{#each grp.grupos as g, idx (idx)}
								{@const desde = grp.grupos
									.slice(0, idx)
									.reduce((s, gg) => s + gg.cantidad, 0)}
								{@const letras = Array.from({ length: g.cantidad }, (_, i) =>
									String.fromCharCode(65 + desde + i)
								).join(', ')}
								<li class="opacity-90">
									<span class="font-mono text-[11px] font-semibold text-brand-700 dark:text-brand-300">
										Zona{g.cantidad > 1 ? 's' : ''} {letras}
									</span>
									<span class="ml-1">
										· {g.tamano} parejas {g.tamano === 4
											? g.modalidad === 'dobleOportunidad'
												? 'DO'
												: 'RR'
											: 'RR'} · clasifican {g.clasifican}
									</span>
								</li>
							{/each}
						</ul>
					</div>
				</div>

				{@render tabsVista()}

				{#if !modoEdicion}
					<!-- Barra de acciones del preview: editar cruces antes de que
					     el bracket real este armado. Se guarda como override en
					     la categoria y se aplica al armar mas tarde. -->
					<div class="mb-3 flex flex-wrap items-center justify-end gap-2">
						<button
							type="button"
							onclick={abrirEditorPreview}
							class="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
						>
							<i class="bi bi-pencil-square"></i>
							Editar cruces
						</button>
					</div>
				{/if}

				{#if modoEdicion && modoEditorFuente === 'preview' && !cuadroModal}
					{@render cuadroEditarRender()}
					{@render editorBarra()}
				{:else if modoEdicion && modoEditorFuente === 'preview' && cuadroModal}
					<!-- Vivido en el modal overlay abajo. Placeholder vacio aca. -->
				{:else if vistaCuadro === 'cuadro'}
					{@render cuadroPreviewRender()}
				{:else}
					<section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
						<h2 class="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
							Cuadro Final ({grp.bracket.length}
							{grp.bracket.length === 1 ? 'partido' : 'partidos'})
						</h2>
						<ol class="space-y-1">
							{#each grp.bracket as p (p.numero)}
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
					</section>
				{/if}
				<p class="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
					<a
						href={`/torneos/${tid}/categorias/${cid}/zonas`}
						class="font-medium text-brand-700 hover:underline dark:text-brand-300"
					>
						Ir a Zonas
					</a>
					para armar con inscripciones reales.
				</p>
			{:else if previewBracket}
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

				{@render tabsVista()}

				{#if !modoEdicion}
					<!-- Barra de acciones del preview. -->
					<div class="mb-3 flex flex-wrap items-center justify-end gap-2">
						<button
							type="button"
							onclick={abrirEditorPreview}
							class="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
						>
							<i class="bi bi-pencil-square"></i>
							Editar cruces
						</button>
					</div>
				{/if}

				{#if modoEdicion && modoEditorFuente === 'preview' && !cuadroModal}
					{@render cuadroEditarRender()}
					{@render editorBarra()}
				{:else if modoEdicion && modoEditorFuente === 'preview' && cuadroModal}
					<!-- Vivido en el modal overlay abajo. Placeholder vacio aca. -->
				{:else if vistaCuadro === 'cuadro'}
					{@render cuadroPreviewRender()}
				{:else}
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
					</section>
				{/if}
				<p class="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
					<a
						href={`/torneos/${tid}/categorias/${cid}/zonas`}
						class="font-medium text-brand-700 hover:underline dark:text-brand-300"
					>
						Ir a Zonas
					</a>
					para armar con inscripciones reales.
				</p>
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
			{@render tabsVista()}

			{#if !modoEdicion}
				<!-- Barra de acciones del cuadro armado: visible siempre en este
				     bloque, sin necesidad de scrollear al header. -->
				<div class="mb-3 flex flex-wrap items-center justify-end gap-2">
					<button
						type="button"
						onclick={abrirEditor}
						class="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
					>
						<i class="bi bi-pencil-square"></i>
						Editar cruces
					</button>
				</div>
			{/if}

			{#if modoEdicion && modoEditorFuente === 'armado' && !cuadroModal}
				{@render cuadroEditarRender()}
				{@render editorBarra()}
			{:else if modoEdicion && modoEditorFuente === 'armado' && cuadroModal}
				<!-- Vivido en el modal overlay abajo. -->
			{:else if vistaCuadro === 'cuadro'}
				<!-- Vista CUADRO: columnas por ronda, posicionamos cada card en
				     su coordenada Y exacta usando `posicionEnRonda` (slot del
				     cuadro). Asi byes y cruces quedan en la posicion correcta
				     y los conectores caen donde corresponde.
				     SLOT_RONDA1 = 2^(rondas-1) = cuadro/2: derivado del numero
				     total de rondas (NO del max posicionEnRonda real), porque
				     cuando los byes caen en slots altos del snake R1 puede
				     tener su partido real en un slot intermedio y el max
				     subestima la altura del cuadro. -->
				{@const SLOT_RONDA1 = Math.pow(2, rondas.length - 1)}
				{@const ALTO_SLOT = cuadroExpandido ? 130 : 90}
				{@const ALTURA_TOTAL = Math.max(cuadroExpandido ? 600 : 440, SLOT_RONDA1 * ALTO_SLOT)}
				{@const ANCHO_COL = cuadroExpandido ? 340 : 220}
				<!-- Panel con scroll propio (horizontal y vertical). Necesario
				     para que el sticky de los headers funcione: sticky se ancla
				     al ancestor con overflow auto/scroll mas cercano.
				     Cuando expandido: full-bleed (w-screen + margenes negativos)
				     para escapar del max-w-4xl del wrapper y aprovechar todo el
				     ancho del viewport en desktop. -->
				<div
					class="overflow-auto border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 rounded-xl {aplicarFullBleed ? 'w-[calc(100vw-20px)] ml-[calc(50%-50vw+10px)]' : ''}"
					style="max-height: 75vh;"
				>
					<div class="flex gap-12">
						{#each rondas as g, idxRonda (g.ronda)}
							{@const slotsRonda = SLOT_RONDA1 / Math.pow(2, idxRonda)}
							{@const espacioPorSlot = ALTURA_TOTAL / Math.max(slotsRonda, 1)}
							<div class="shrink-0" style="width: {ANCHO_COL}px;">
								<!-- Header sticky: fijo arriba al scrollear vertical
								     dentro del panel. Se mueve horizontal con su columna. -->
								<div
									class="sticky top-0 z-10 mb-2 bg-white dark:bg-gray-900"
								>
									<p class="border-b border-gray-100 py-2 text-center font-semibold tracking-wider text-gray-500 uppercase dark:border-gray-800 dark:text-gray-400 {cuadroExpandido ? 'text-[13px]' : 'text-[11px]'}">
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
										{@const codigoArm = codigosArmado.get(p.id) ?? ''}
										<button
											type="button"
											onclick={() => abrirResultado(p.id)}
											class="absolute rounded-md border border-gray-200 bg-white text-left shadow-sm transition hover:border-brand-400 hover:shadow dark:border-gray-700 dark:bg-gray-800 dark:hover:border-brand-500"
											style="top: {top}px; left: 0; right: 0; transform: translateY(-50%);"
										>
											{#if codigoArm}
												<!-- Codigo corto identificatorio del partido en el cuadro. -->
												<span class="absolute top-1 right-1 rounded font-mono {cuadroExpandido ? 'text-[11px]' : 'text-[9px]'} font-semibold tracking-wide text-gray-400 dark:text-gray-500">
													{codigoArm}
												</span>
											{/if}
											<!-- Conector entrante: solo si la card tiene una
											     dependencia real con la ronda anterior. -->
											{#if idxRonda > 0 && tieneEntrada}
												<span
													class="pointer-events-none absolute top-1/2 -left-6 h-px w-6 bg-gray-300 dark:bg-gray-600"
												></span>
											{/if}
											<!-- Pareja 1: nombres apilados (uno arriba del otro) -->
											<div class="flex items-start gap-1.5 border-b border-gray-100 dark:border-gray-700 {cuadroExpandido ? 'px-3 py-2' : 'px-2 py-1.5'}">
												{#if origen1}
													<span class="mt-0.5 inline-flex shrink-0 items-center justify-center rounded bg-gray-100 font-mono font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-400 {cuadroExpandido ? 'h-5 w-9 text-[11px]' : 'h-4 w-7 text-[9px]'}">
														{origen1}
													</span>
												{/if}
												<div class="min-w-0 flex-1">
													{#each nombres1 as n, j (j)}
														<p class="truncate leading-tight {cuadroExpandido ? 'text-[14px]' : 'text-[11px]'} {gana1 ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}">
															{n}
														</p>
													{/each}
												</div>
												{#if jugado}
													<span class="mt-0.5 shrink-0 font-mono {cuadroExpandido ? 'text-[13px]' : 'text-[10px]'} {gana1 ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-500'}">
														{sets.map((s) => s.p1).join(' ')}
													</span>
												{/if}
											</div>
											<!-- Pareja 2 -->
											<div class="flex items-start gap-1.5 {cuadroExpandido ? 'px-3 py-2' : 'px-2 py-1.5'}">
												{#if origen2}
													<span class="mt-0.5 inline-flex shrink-0 items-center justify-center rounded bg-gray-100 font-mono font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-400 {cuadroExpandido ? 'h-5 w-9 text-[11px]' : 'h-4 w-7 text-[9px]'}">
														{origen2}
													</span>
												{/if}
												<div class="min-w-0 flex-1">
													{#each nombres2 as n, j (j)}
														<p class="truncate leading-tight {cuadroExpandido ? 'text-[14px]' : 'text-[11px]'} {gana2 ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}">
															{n}
														</p>
													{/each}
												</div>
												{#if jugado}
													<span class="mt-0.5 shrink-0 font-mono {cuadroExpandido ? 'text-[13px]' : 'text-[10px]'} {gana2 ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-500'}">
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

<!-- Toggle Lista/Cuadro reutilizable: usado en el preview (custom y simple)
     y en el bracket armado. Unifica los 3 copies que existian. -->
{#snippet tabsVista()}
	<div class="mb-3 flex items-center gap-2">
		<div class="flex flex-1 items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
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
			<!-- Toggle expandir/contraer: ensancha las cards y aumenta la
			     tipografia para leer mejor en desktop. -->
			<button
				type="button"
				onclick={() => (cuadroExpandido = !cuadroExpandido)}
				aria-label={cuadroExpandido ? 'Contraer cuadro' : 'Expandir cuadro'}
				title={cuadroExpandido ? 'Contraer cuadro' : 'Expandir cuadro'}
				class="flex items-center justify-center rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
			>
				<i class="bi {cuadroExpandido ? 'bi-arrows-angle-contract' : 'bi-arrows-angle-expand'} text-base"></i>
			</button>
		{/if}
	</div>
{/snippet}

<!-- Render del cuadro grafico para el preview (sin resultados, refs simbolicas).
     Misma geometria que el bracket armado: columnas por ronda, cards
     posicionadas por slot via `posicionEnRonda`, conectores condicionales
     segun si la ref es Ganador/Perdedor o PosicionZona (bye directo). -->
{#snippet cuadroPreviewRender()}
	{#if previewActivo && rondasPreview.length > 0}
		<!-- SLOT_RONDA1 = 2^(rondas-1): derivado del numero total de rondas
		     (NO del max posicionEnRonda real), porque cuando los byes caen
		     en slots altos del snake R1 puede tener su partido real en un
		     slot intermedio y el max subestima la altura del cuadro. -->
		{@const SLOT_RONDA1 = Math.pow(2, rondasPreview.length - 1)}
		{@const ALTO_SLOT = cuadroExpandido ? 130 : 90}
		{@const ALTURA_TOTAL = Math.max(cuadroExpandido ? 600 : 440, SLOT_RONDA1 * ALTO_SLOT)}
		{@const ANCHO_COL = cuadroExpandido ? 340 : 220}
		<!-- Cuando expandido: full-bleed para escapar del max-w-4xl. -->
		<div
			class="overflow-auto border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 rounded-xl {aplicarFullBleed ? 'w-[calc(100vw-20px)] ml-[calc(50%-50vw+10px)]' : ''}"
			style="max-height: 75vh;"
		>
			<div class="flex gap-12">
				{#each rondasPreview as g, idxRonda (g.ronda)}
					{@const slotsRonda = SLOT_RONDA1 / Math.pow(2, idxRonda)}
					{@const espacioPorSlot = ALTURA_TOTAL / Math.max(slotsRonda, 1)}
					<div class="shrink-0" style="width: {ANCHO_COL}px;">
						<div class="sticky top-0 z-10 mb-2 bg-white dark:bg-gray-900">
							<p class="border-b border-gray-100 py-2 text-center font-semibold tracking-wider text-gray-500 uppercase dark:border-gray-800 dark:text-gray-400 {cuadroExpandido ? 'text-[13px]' : 'text-[11px]'}">
								{g.fase}
							</p>
						</div>
						<div class="relative" style="height: {ALTURA_TOTAL}px;">
							{#each g.partidos as p (p.numero)}
								{@const slot = p.posicionEnRonda}
								{@const top = (slot - 0.5) * espacioPorSlot}
								{@const tieneEntrada =
									p.pareja1Ref.tipo === 'GanadorPartido' ||
									p.pareja1Ref.tipo === 'PerdedorPartido' ||
									p.pareja2Ref.tipo === 'GanadorPartido' ||
									p.pareja2Ref.tipo === 'PerdedorPartido'}
								{@const origen1 = origenPreview(p.pareja1Ref)}
								{@const origen2 = origenPreview(p.pareja2Ref)}
								{@const nombre1 = nombrePreview(p.pareja1Ref)}
								{@const nombre2 = nombrePreview(p.pareja2Ref)}
								<!-- Codigo del partido arriba a la derecha. La Final no
								     tiene codigo corto enumerado: usamos "F" como etiqueta. -->
								{@const etiquetaCodigo = p.codigo || (p.fase === 'Final' ? 'F' : '')}
								<div
									class="absolute rounded-md border border-dashed border-gray-300 bg-gray-50 text-left dark:border-gray-700 dark:bg-gray-800/40"
									style="top: {top}px; left: 0; right: 0; transform: translateY(-50%);"
								>
									{#if etiquetaCodigo}
										<!-- Chip dentro de la card (top-1 right-1): evita
										     solape con el conector saliente de la card de
										     arriba y con el header sticky al scrollear. -->
										<span class="absolute top-1 right-1 rounded font-mono font-semibold tracking-wide text-gray-400 dark:text-gray-500 {cuadroExpandido ? 'text-[11px]' : 'text-[9px]'}">
											{etiquetaCodigo}
										</span>
									{/if}
									{#if idxRonda > 0 && tieneEntrada}
										<span
											class="pointer-events-none absolute top-1/2 -left-6 h-px w-6 bg-gray-300 dark:bg-gray-600"
										></span>
									{/if}
									<!-- Pareja 1 -->
									<div class="flex items-start gap-1.5 border-b border-gray-100 dark:border-gray-700 {cuadroExpandido ? 'px-3 py-2' : 'px-2 py-1.5'}">
										{#if origen1}
											<span class="mt-0.5 inline-flex shrink-0 items-center justify-center rounded bg-gray-100 px-1 font-mono font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-400 {cuadroExpandido ? 'h-5 min-w-9 text-[11px]' : 'h-4 min-w-7 text-[9px]'}">
												{origen1}
											</span>
										{/if}
										<div class="min-w-0 flex-1">
											<p class="truncate leading-tight text-gray-600 dark:text-gray-400 {cuadroExpandido ? 'text-[14px]' : 'text-[11px]'}" title={nombre1}>
												{nombre1}
											</p>
										</div>
									</div>
									<!-- Pareja 2 -->
									<div class="flex items-start gap-1.5 {cuadroExpandido ? 'px-3 py-2' : 'px-2 py-1.5'}">
										{#if origen2}
											<span class="mt-0.5 inline-flex shrink-0 items-center justify-center rounded bg-gray-100 px-1 font-mono font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-400 {cuadroExpandido ? 'h-5 min-w-9 text-[11px]' : 'h-4 min-w-7 text-[9px]'}">
												{origen2}
											</span>
										{/if}
										<div class="min-w-0 flex-1">
											<p class="truncate leading-tight text-gray-600 dark:text-gray-400 {cuadroExpandido ? 'text-[14px]' : 'text-[11px]'}" title={nombre2}>
												{nombre2}
											</p>
										</div>
									</div>
									<!-- Conector saliente: linea horizontal + vertical hasta la
									     card de la ronda siguiente, calculada por el slot que le
									     toca al ganador en la ronda+1: ceil(slot/2). -->
									{#if idxRonda < rondasPreview.length - 1}
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
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
{/snippet}

<!-- Cuadro EDITABLE: igual aspecto que el preview pero con click handlers
     sobre cada ref PosicionZona/Inscripcion. Los conectores y refs
     derivadas (Ganador/Perdedor) se recalculan en vivo desde slotsEdit. -->
{#snippet cuadroEditarRender()}
	{#if bracketEditando && rondasEditando.length > 0}
		{@const SLOT_RONDA1 = Math.pow(2, rondasEditando.length - 1)}
		{@const ALTO_SLOT = cuadroExpandido ? 130 : 90}
		{@const ALTURA_TOTAL = Math.max(cuadroExpandido ? 600 : 440, SLOT_RONDA1 * ALTO_SLOT)}
		{@const ANCHO_COL = cuadroExpandido ? 340 : 220}
		<div
			class="overflow-auto rounded-xl border border-brand-300 bg-white p-4 ring-2 ring-brand-200 dark:border-brand-700 dark:bg-gray-900 dark:ring-brand-900/40 {aplicarFullBleed ? 'w-[calc(100vw-20px)] ml-[calc(50%-50vw+10px)]' : ''} {cuadroModal ? 'h-full border-0 ring-0 rounded-none p-0' : ''}"
			style={cuadroModal ? '' : 'max-height: 75vh;'}
		>
			<div class="flex gap-12 {cuadroModal ? 'p-2 sm:p-4' : ''}">
				{#each rondasEditando as g, idxRonda (g.ronda)}
					{@const slotsRonda = SLOT_RONDA1 / Math.pow(2, idxRonda)}
					{@const espacioPorSlot = ALTURA_TOTAL / Math.max(slotsRonda, 1)}
					<div class="shrink-0" style="width: {ANCHO_COL}px;">
						<div class="sticky top-0 z-10 mb-2 bg-white dark:bg-gray-900">
							<p class="border-b border-gray-100 py-2 text-center font-semibold tracking-wider text-gray-500 uppercase dark:border-gray-800 dark:text-gray-400 {cuadroExpandido ? 'text-[13px]' : 'text-[11px]'}">
								{g.fase}
							</p>
						</div>
						<div class="relative" style="height: {ALTURA_TOTAL}px;">
							{#if idxRonda === 0}
								<!-- R1: render TODOS los pares de slots, incluso los vacios.
								     Asi el usuario puede swappear refs hacia slots Bye libres
								     y crear/eliminar partidos R1 a discrecion. -->
								{@const totalPares = slotsEdit.length / 2}
								{#each Array(totalPares) as _, idxPar (idxPar)}
									{@const slotA = idxPar * 2}
									{@const slotB = slotA + 1}
									{@const refA = slotsEdit[slotA] ?? null}
									{@const refB = slotsEdit[slotB] ?? null}
									{@const slot = idxPar + 1}
									{@const top = (slot - 0.5) * espacioPorSlot}
									{@const sel1 = seleccionSlot === slotA}
									{@const sel2 = seleccionSlot === slotB}
									{@const origen1 = origenDeRefEditando(refA)}
									{@const origen2 = origenDeRefEditando(refB)}
									{@const nombre1 = nombreDeRefEditando(refA)}
									{@const nombre2 = nombreDeRefEditando(refB)}
									{@const partidoR1 = bracketEditando?.partidos.find(
										(p) => p.ronda === 1 && p.posicionEnRonda === slot
									)}
									{@const codigoPartido = partidoR1
										? codigosEditando.get(partidoR1.numeroEnZona) ?? ''
										: ''}
									{@const ambosVacios = refA === null && refB === null}
									<div
										class="absolute rounded-md border text-left transition {sel1 || sel2 ? 'border-brand-500 bg-white shadow-md ring-2 ring-brand-200 dark:border-brand-400 dark:bg-gray-800 dark:ring-brand-900/50' : ambosVacios ? 'border-dashed border-gray-300 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/30' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'}"
										style="top: {top}px; left: 0; right: 0; transform: translateY(-50%);"
									>
										{#if codigoPartido}
											<span class="absolute top-1 right-1 rounded font-mono font-semibold tracking-wide text-gray-400 dark:text-gray-500 {cuadroExpandido ? 'text-[11px]' : 'text-[9px]'}">
												{codigoPartido}
											</span>
										{/if}
										<!-- Sub-slot A (refA o Bye libre) -->
										<button
											type="button"
											title={refA ? nombre1 : 'Slot vacío — tocá para seleccionarlo y luego elegí otra pareja para moverla aquí'}
											onclick={() => clickSlotEdit(slotA)}
											class="flex w-full items-start gap-1.5 border-b border-gray-100 text-left transition dark:border-gray-700 {cuadroExpandido ? 'px-3 py-2.5' : 'px-2 py-2'} {sel1 ? 'bg-brand-50 dark:bg-brand-900/30' : refA ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer' : 'cursor-pointer hover:bg-brand-50/50 dark:hover:bg-brand-900/20'}"
										>
											<span class="mt-0.5 inline-flex shrink-0 items-center justify-center rounded px-1 font-mono font-semibold {sel1 ? 'bg-brand-200 text-brand-900 dark:bg-brand-700 dark:text-brand-100' : refA ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' : 'border border-dashed border-gray-300 bg-transparent text-gray-300 dark:border-gray-600 dark:text-gray-600'} {cuadroExpandido ? 'h-5 min-w-9 text-[11px]' : 'h-4 min-w-7 text-[9px]'}">
												{origen1}
											</span>
											<div class="min-w-0 flex-1">
												<p class="truncate leading-tight {sel1 ? 'font-semibold text-brand-900 dark:text-brand-200' : refA ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 italic dark:text-gray-500'} {cuadroExpandido ? 'text-[14px]' : 'text-[11px]'}">
													{nombre1}
												</p>
											</div>
											{#if sel1}
												<i class="bi bi-check-circle-fill mt-0.5 shrink-0 text-brand-500"></i>
											{/if}
										</button>
										<!-- Sub-slot B -->
										<button
											type="button"
											title={refB ? nombre2 : 'Slot vacío — tocá para seleccionarlo y luego elegí otra pareja para moverla aquí'}
											onclick={() => clickSlotEdit(slotB)}
											class="flex w-full items-start gap-1.5 text-left transition {cuadroExpandido ? 'px-3 py-2.5' : 'px-2 py-2'} {sel2 ? 'bg-brand-50 dark:bg-brand-900/30' : refB ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer' : 'cursor-pointer hover:bg-brand-50/50 dark:hover:bg-brand-900/20'}"
										>
											<span class="mt-0.5 inline-flex shrink-0 items-center justify-center rounded px-1 font-mono font-semibold {sel2 ? 'bg-brand-200 text-brand-900 dark:bg-brand-700 dark:text-brand-100' : refB ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' : 'border border-dashed border-gray-300 bg-transparent text-gray-300 dark:border-gray-600 dark:text-gray-600'} {cuadroExpandido ? 'h-5 min-w-9 text-[11px]' : 'h-4 min-w-7 text-[9px]'}">
												{origen2}
											</span>
											<div class="min-w-0 flex-1">
												<p class="truncate leading-tight {sel2 ? 'font-semibold text-brand-900 dark:text-brand-200' : refB ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 italic dark:text-gray-500'} {cuadroExpandido ? 'text-[14px]' : 'text-[11px]'}">
													{nombre2}
												</p>
											</div>
											{#if sel2}
												<i class="bi bi-check-circle-fill mt-0.5 shrink-0 text-brand-500"></i>
											{/if}
										</button>
										<!-- Conector saliente: solo si hay al menos 1 ref real
										     en el par (sino el slot R2 propaga null y no hay
										     destino visual). -->
										{#if rondasEditando.length > 1 && (refA !== null || refB !== null)}
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
									</div>
								{/each}
							{:else}
								<!-- R2+: render normal de partidos derivados desde slotsEdit. -->
								{#each g.partidos as p (p.numeroEnZona)}
								{@const slot = p.posicionEnRonda}
								{@const top = (slot - 0.5) * espacioPorSlot}
								{@const tieneEntrada =
									p.pareja1Ref.tipo === 'GanadorPartido' ||
									p.pareja1Ref.tipo === 'PerdedorPartido' ||
									p.pareja2Ref.tipo === 'GanadorPartido' ||
									p.pareja2Ref.tipo === 'PerdedorPartido'}
								{@const editable1 =
									p.pareja1Ref.tipo === 'PosicionZona' ||
									p.pareja1Ref.tipo === 'Inscripcion'}
								{@const editable2 =
									p.pareja2Ref.tipo === 'PosicionZona' ||
									p.pareja2Ref.tipo === 'Inscripcion'}
								{@const sel1 = esSeleccionada(p.pareja1Ref)}
								{@const sel2 = esSeleccionada(p.pareja2Ref)}
								{@const origen1 = origenDeRefEditando(p.pareja1Ref)}
								{@const origen2 = origenDeRefEditando(p.pareja2Ref)}
								{@const nombre1 = nombreDeRefEditando(p.pareja1Ref)}
								{@const nombre2 = nombreDeRefEditando(p.pareja2Ref)}
								{@const codigoPartido = codigosEditando.get(p.numeroEnZona) ?? ''}
								<div
									class="absolute rounded-md border bg-white text-left transition dark:bg-gray-800 {sel1 || sel2 ? 'border-brand-500 shadow-md ring-2 ring-brand-200 dark:border-brand-400 dark:ring-brand-900/50' : 'border-gray-200 dark:border-gray-700'}"
									style="top: {top}px; left: 0; right: 0; transform: translateY(-50%);"
								>
									{#if codigoPartido}
										<span class="absolute top-1 right-1 rounded font-mono font-semibold tracking-wide text-gray-400 dark:text-gray-500 {cuadroExpandido ? 'text-[11px]' : 'text-[9px]'}">
											{codigoPartido}
										</span>
									{/if}
									{#if idxRonda > 0 && tieneEntrada}
										<span
											class="pointer-events-none absolute top-1/2 -left-6 h-px w-6 bg-gray-300 dark:bg-gray-600"
										></span>
									{/if}
									<!-- Pareja 1 (clickeable solo si editable). Refs derivadas
									     (Ganador/Perdedor) tienen fondo gris + candado para
									     dejar claro que no son editables. -->
									<button
										type="button"
										disabled={!editable1}
										title={editable1 ? nombre1 : `${nombre1} (no editable: depende del resultado del partido previo)`}
										onclick={() => clickRefEdit(p.pareja1Ref)}
										class="flex w-full items-start gap-1.5 border-b border-gray-100 text-left transition dark:border-gray-700 {cuadroExpandido ? 'px-3 py-2.5' : 'px-2 py-2'} {sel1 ? 'bg-brand-50 dark:bg-brand-900/30' : editable1 ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer' : 'cursor-not-allowed bg-gray-50 dark:bg-gray-900/40'}"
									>
										<span class="mt-0.5 inline-flex shrink-0 items-center justify-center rounded px-1 font-mono font-semibold {sel1 ? 'bg-brand-200 text-brand-900 dark:bg-brand-700 dark:text-brand-100' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'} {cuadroExpandido ? 'h-5 min-w-9 text-[11px]' : 'h-4 min-w-7 text-[9px]'}">
											{origen1}
										</span>
										<div class="min-w-0 flex-1">
											<p class="truncate leading-tight {sel1 ? 'font-semibold text-brand-900 dark:text-brand-200' : editable1 ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 italic dark:text-gray-500'} {cuadroExpandido ? 'text-[14px]' : 'text-[11px]'}">
												{nombre1}
											</p>
										</div>
										{#if sel1}
											<i class="bi bi-check-circle-fill mt-0.5 shrink-0 text-brand-500"></i>
										{:else if !editable1}
											<i class="bi bi-lock-fill mt-0.5 shrink-0 text-[11px] text-gray-400 dark:text-gray-500"></i>
										{/if}
									</button>
									<!-- Pareja 2 -->
									<button
										type="button"
										disabled={!editable2}
										title={editable2 ? nombre2 : `${nombre2} (no editable: depende del resultado del partido previo)`}
										onclick={() => clickRefEdit(p.pareja2Ref)}
										class="flex w-full items-start gap-1.5 text-left transition {cuadroExpandido ? 'px-3 py-2.5' : 'px-2 py-2'} {sel2 ? 'bg-brand-50 dark:bg-brand-900/30' : editable2 ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer' : 'cursor-not-allowed bg-gray-50 dark:bg-gray-900/40'}"
									>
										<span class="mt-0.5 inline-flex shrink-0 items-center justify-center rounded px-1 font-mono font-semibold {sel2 ? 'bg-brand-200 text-brand-900 dark:bg-brand-700 dark:text-brand-100' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'} {cuadroExpandido ? 'h-5 min-w-9 text-[11px]' : 'h-4 min-w-7 text-[9px]'}">
											{origen2}
										</span>
										<div class="min-w-0 flex-1">
											<p class="truncate leading-tight {sel2 ? 'font-semibold text-brand-900 dark:text-brand-200' : editable2 ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 italic dark:text-gray-500'} {cuadroExpandido ? 'text-[14px]' : 'text-[11px]'}">
												{nombre2}
											</p>
										</div>
										{#if sel2}
											<i class="bi bi-check-circle-fill mt-0.5 shrink-0 text-brand-500"></i>
										{:else if !editable2}
											<i class="bi bi-lock-fill mt-0.5 shrink-0 text-[11px] text-gray-400 dark:text-gray-500"></i>
										{/if}
									</button>
									{#if idxRonda < rondasEditando.length - 1}
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
								</div>
							{/each}
							<!-- Cards fantasma R2+: pares de slots conceptuales que NO
							     generan partido (bye que sube hasta una ronda mas alta,
							     o doble vacio). Asi el usuario ve a donde va el ganador
							     por bye. No son editables — solo visuales. -->
							{@const slotsRondaActual = slotsPorRonda[idxRonda] ?? []}
							{@const totalParesRonda = slotsRondaActual.length / 2}
							{#each Array(totalParesRonda) as _, idxPar (idxPar)}
								{@const slotRA = idxPar * 2}
								{@const slotRB = slotRA + 1}
								{@const refRA = slotsRondaActual[slotRA] ?? null}
								{@const refRB = slotsRondaActual[slotRB] ?? null}
								{@const tienePartidoReal =
									refRA !== null &&
									refRB !== null &&
									bracketEditando?.partidos.some(
										(p) =>
											p.ronda === idxRonda + 1 && p.posicionEnRonda === idxPar + 1
									)}
								{#if !tienePartidoReal}
									{@const slotFantasma = idxPar + 1}
									{@const topFantasma = (slotFantasma - 0.5) * espacioPorSlot}
									{@const ambasNull = refRA === null && refRB === null}
									{@const origenF1 = origenDeRefEditando(refRA)}
									{@const origenF2 = origenDeRefEditando(refRB)}
									{@const nombreF1 = nombreDeRefEditando(refRA)}
									{@const nombreF2 = nombreDeRefEditando(refRB)}
									<div
										class="absolute rounded-md border border-dashed border-gray-300 dark:border-gray-700 {ambasNull ? 'bg-gray-50/30 dark:bg-gray-800/20' : 'bg-white/60 dark:bg-gray-800/40'}"
										style="top: {topFantasma}px; left: 0; right: 0; transform: translateY(-50%);"
									>
										<!-- Sub-slot A (visual, no editable). -->
										<div
											class="flex w-full items-start gap-1.5 border-b border-gray-100 dark:border-gray-700 {cuadroExpandido ? 'px-3 py-2.5' : 'px-2 py-2'}"
											title={refRA ? `${nombreF1} (sube directo por bye)` : 'Sin pareja en este slot'}
										>
											<span class="mt-0.5 inline-flex shrink-0 items-center justify-center rounded px-1 font-mono font-semibold {refRA ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' : 'border border-dashed border-gray-300 bg-transparent text-gray-300 dark:border-gray-600 dark:text-gray-600'} {cuadroExpandido ? 'h-5 min-w-9 text-[11px]' : 'h-4 min-w-7 text-[9px]'}">
												{origenF1}
											</span>
											<div class="min-w-0 flex-1">
												<p class="truncate leading-tight italic {refRA ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500'} {cuadroExpandido ? 'text-[14px]' : 'text-[11px]'}">
													{nombreF1}{refRA ? ' →' : ''}
												</p>
											</div>
											{#if refRA}
												<i class="bi bi-arrow-up-right-circle mt-0.5 shrink-0 text-[11px] text-gray-400 dark:text-gray-500"></i>
											{/if}
										</div>
										<!-- Sub-slot B. -->
										<div
											class="flex w-full items-start gap-1.5 {cuadroExpandido ? 'px-3 py-2.5' : 'px-2 py-2'}"
											title={refRB ? `${nombreF2} (sube directo por bye)` : 'Sin pareja en este slot'}
										>
											<span class="mt-0.5 inline-flex shrink-0 items-center justify-center rounded px-1 font-mono font-semibold {refRB ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' : 'border border-dashed border-gray-300 bg-transparent text-gray-300 dark:border-gray-600 dark:text-gray-600'} {cuadroExpandido ? 'h-5 min-w-9 text-[11px]' : 'h-4 min-w-7 text-[9px]'}">
												{origenF2}
											</span>
											<div class="min-w-0 flex-1">
												<p class="truncate leading-tight italic {refRB ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500'} {cuadroExpandido ? 'text-[14px]' : 'text-[11px]'}">
													{nombreF2}{refRB ? ' →' : ''}
												</p>
											</div>
											{#if refRB}
												<i class="bi bi-arrow-up-right-circle mt-0.5 shrink-0 text-[11px] text-gray-400 dark:text-gray-500"></i>
											{/if}
										</div>
										{#if idxRonda < rondasEditando.length - 1 && (refRA !== null || refRB !== null)}
											{@const slotSigF = Math.ceil(slotFantasma / 2)}
											{@const slotsSigF = slotsRonda / 2}
											{@const topSigF = (slotSigF - 0.5) * (ALTURA_TOTAL / Math.max(slotsSigF, 1))}
											{@const dyF = topSigF - topFantasma}
											<span
												class="pointer-events-none absolute top-1/2 -right-6 h-px w-6 bg-gray-300 dark:bg-gray-600"
											></span>
											{#if dyF > 0}
												<span
													class="pointer-events-none absolute top-1/2 -right-6 w-px bg-gray-300 dark:bg-gray-600"
													style="height: {dyF}px;"
												></span>
											{:else if dyF < 0}
												<span
													class="pointer-events-none absolute -right-6 w-px bg-gray-300 dark:bg-gray-600"
													style="top: calc(50% + {dyF}px); height: {Math.abs(dyF)}px;"
												></span>
											{/if}
										{/if}
									</div>
								{/if}
							{/each}
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
{/snippet}

<!-- Barra inferior sticky con info de seleccion + acciones del editor.
     Cuando el cuadro esta en modo full-bleed (cuadroExpandido), la barra
     tambien escapa del max-w-4xl para no quedar centrada/recortada. -->
{#snippet editorBarra()}
	<div class="{cuadroModal ? '' : 'sticky bottom-0 left-0 right-0 z-20 mt-3 rounded-xl border border-brand-200 shadow-lg dark:border-brand-800'} bg-white p-3 dark:bg-gray-900 {aplicarFullBleed ? 'w-[calc(100vw-20px)] ml-[calc(50%-50vw+10px)]' : ''}">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="text-xs">
				{#if seleccionSlot === null}
					<p class="font-medium text-gray-700 dark:text-gray-300">
						<i class="bi bi-cursor"></i>
						Tocá una pareja del cuadro para seleccionarla.
					</p>
					<p class="mt-0.5 text-gray-500 dark:text-gray-400">
						Luego tocá otra pareja para intercambiar sus posiciones. Los conectores y las rondas siguientes se actualizan en vivo.
					</p>
				{:else}
					<p class="font-semibold text-brand-700 dark:text-brand-300">
						<i class="bi bi-check-circle-fill"></i>
						Seleccionado: {textoSeleccion}
					</p>
					<p class="mt-0.5 text-gray-500 dark:text-gray-400">
						Tocá otra pareja del cuadro para intercambiarlas. Tocá la misma para deseleccionar.
					</p>
				{/if}
			</div>
			<div class="flex flex-wrap gap-2 sm:shrink-0">
				<button
					type="button"
					onclick={() => {
						if (cuadroModal) {
							cuadroModal = false;
						} else {
							cuadroExpandido = true;
							cuadroModal = true;
						}
					}}
					title={cuadroModal ? 'Salir de pantalla completa' : 'Editar en pantalla completa'}
					class="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
				>
					<i class="bi {cuadroModal ? 'bi-fullscreen-exit' : 'bi-fullscreen'}"></i>
				</button>
				<button
					type="button"
					onclick={handleResetSnake}
					disabled={guardando}
					class="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
				>
					<i class="bi bi-arrow-counterclockwise"></i>
					Reset
				</button>
				<button
					type="button"
					onclick={cerrarEditor}
					disabled={guardando}
					class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
				>
					Cancelar
				</button>
				<button
					type="button"
					onclick={handleGuardarEditor}
					disabled={guardando}
					class="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
				>
					{#if guardando}
						<i class="bi bi-arrow-clockwise animate-spin"></i>
					{:else}
						<i class="bi bi-check2"></i>
					{/if}
					Guardar
				</button>
			</div>
		</div>
	</div>
{/snippet}

<!-- Atajo de teclado: ESC cierra el modal cuando esta abierto. -->
<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && cuadroModal) {
			e.preventDefault();
			cuadroModal = false;
		}
	}}
/>

<!-- Modal full-screen del editor. Overlay fixed que cubre el viewport
     completo con backdrop semitransparente. Click fuera o tecla ESC cierra.
     Adentro: el mismo cuadroEditarRender + editorBarra que se mostraban
     inline — pero ahora con todo el espacio de la pantalla disponible. -->
{#if cuadroModal && modoEdicion}
	<div
		class="fixed inset-0 z-50 flex flex-col bg-black/60"
		role="dialog"
		aria-modal="true"
		aria-label="Editor de cruces en pantalla completa"
		onclick={(e) => {
			if (e.target === e.currentTarget) cuadroModal = false;
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') cuadroModal = false;
		}}
		tabindex="-1"
	>
		<div
			class="m-2 flex flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-900 sm:m-4"
			onclick={(e) => e.stopPropagation()}
			role="presentation"
		>
			<!-- Header del modal: titulo + boton cerrar. -->
			<header class="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
				<div>
					<h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
						Editar cruces — pantalla completa
					</h2>
					<p class="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
						{modoEditorFuente === 'preview'
							? 'Los cambios se aplicarán al armar el cuadro real.'
							: 'Al guardar, el cuadro se re-arma y borra los resultados cargados.'}
					</p>
				</div>
				<button
					type="button"
					onclick={() => (cuadroModal = false)}
					aria-label="Salir de pantalla completa"
					title="Salir (ESC)"
					class="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
				>
					<i class="bi bi-x-lg text-lg"></i>
				</button>
			</header>
			<!-- Cuerpo: el cuadro editable ocupa el espacio disponible (flex-1
			     con overflow auto interno). -->
			<div class="flex-1 overflow-auto p-3 sm:p-4">
				{@render cuadroEditarRender()}
			</div>
			<!-- Footer: misma editorBarra con su info de seleccion y acciones. -->
			<div class="shrink-0 border-t border-gray-200 p-3 dark:border-gray-700">
				{@render editorBarra()}
			</div>
		</div>
	</div>
{/if}

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

