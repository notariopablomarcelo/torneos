<script lang="ts">
	import Modal from './BottomSheet.svelte';
	import type { Jugador } from '$lib/types/jugador';

	// Modal de seleccion de jugador. Pantalla completa (en mobile) con
	// buscador arriba y lista debajo con scroll interno. Se monta anidado
	// dentro del modal de Inscripcion: el <dialog> nativo soporta anidacion
	// (el segundo va al top layer), Esc cierra solo el del top.

	type Props = {
		open: boolean;
		onClose: () => void;
		onSelect: (id: string | null) => void;
		value: string | null;
		jugadores: Jugador[];
		excluir?: string[];
		title?: string;
	};

	let {
		open,
		onClose,
		onSelect,
		value,
		jugadores,
		excluir = [],
		title = 'Elegir jugador'
	}: Props = $props();

	let busqueda = $state('');

	function normalizar(s: string): string {
		return s
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase();
	}

	const opciones = $derived.by(() => {
		const q = normalizar(busqueda.trim());
		const base = jugadores.filter((j) => !excluir.includes(j.id));
		const filtrados = q ? base.filter((j) => normalizar(j.nombreCompleto).includes(q)) : base;
		return [...filtrados].sort((a, b) =>
			a.nombreCompleto.localeCompare(b.nombreCompleto, 'es', { sensitivity: 'base' })
		);
	});

	function seleccionar(id: string | null) {
		onSelect(id);
		busqueda = '';
		onClose();
	}

	// Reset de la busqueda cuando se cierra desde afuera (Esc, backdrop, X).
	$effect(() => {
		if (!open) busqueda = '';
	});
</script>

<Modal {open} {onClose} {title}>
	<div class="space-y-3">
		<div class="relative">
			<i
				class="bi bi-search absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
			></i>
			<input
				type="search"
				bind:value={busqueda}
				placeholder="Buscar…"
				aria-label="Buscar jugador"
				class="w-full rounded-lg border border-gray-300 bg-white py-2 pr-3 pl-9 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
			/>
		</div>

		{#if value}
			<button
				type="button"
				onclick={() => seleccionar(null)}
				class="flex w-full items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
			>
				<i class="bi bi-x-circle"></i>
				Quitar selección
			</button>
		{/if}

		{#if opciones.length === 0}
			<p class="py-8 text-center text-sm text-gray-500">
				{busqueda ? `Sin resultados para "${busqueda}"` : 'No hay jugadores disponibles'}
			</p>
		{:else}
			<ul
				class="max-h-[55vh] divide-y divide-gray-100 overflow-y-auto overscroll-contain rounded-lg border border-gray-200"
			>
				{#each opciones as o (o.id)}
					<li>
						<button
							type="button"
							onclick={() => seleccionar(o.id)}
							class="block w-full px-3 py-3 text-left text-sm hover:bg-gray-50 {o.id === value
								? 'bg-brand-50 font-medium text-brand-700'
								: 'text-gray-900'}"
						>
							{o.nombreCompleto}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</Modal>
