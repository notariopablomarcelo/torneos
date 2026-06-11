<script lang="ts">
	import type { Jugador } from '$lib/types/jugador';
	import JugadorPicker from './JugadorPicker.svelte';

	// Selector de jugador estilo "campo Material que abre un modal picker".
	// Mantiene la apariencia outlined consistente con SelectField, pero al
	// clickear abre JugadorPicker — un modal con buscador + lista. Asi se
	// evitan los problemas de un dropdown inline dentro de un modal angosto.

	type Props = {
		id: string;
		label: string;
		value: string | null;
		onChange: (id: string | null) => void;
		jugadores: Jugador[];
		excluir?: string[];
		error?: string | null;
	};

	let { id, label, value, onChange, jugadores, excluir = [], error }: Props = $props();

	let picker = $state(false);

	const seleccionado = $derived(jugadores.find((j) => j.id === value) ?? null);

	// Marca el caso "el value apunta a un jugador eliminado". Asi en lugar de
	// mostrar el placeholder (confundir con vacio) damos un mensaje claro.
	const huerfano = $derived(value !== null && !seleccionado);
</script>

<div class="relative">
	<button
		{id}
		type="button"
		onclick={() => (picker = true)}
		class="block w-full rounded-lg border bg-white px-3 pt-5 pr-9 pb-1.5 text-left text-sm focus:outline-none focus:ring-2 dark:bg-gray-900 {error
			? 'border-red-400 focus:border-red-500 focus:ring-red-200'
			: 'border-gray-300 focus:border-brand-500 focus:ring-brand-200 dark:border-gray-700'}"
	>
		<span
			class={seleccionado
				? 'text-gray-900 dark:text-gray-100'
				: huerfano
					? 'text-red-600'
					: 'text-gray-400 dark:text-gray-500'}
		>
			{seleccionado?.nombreCompleto ?? (huerfano ? 'Jugador no encontrado' : 'Tocá para elegir')}
		</span>
		<i
			class="bi bi-chevron-right absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 dark:text-gray-500"
		></i>
	</button>
	<label
		for={id}
		class="pointer-events-none absolute start-3 top-1 z-10 text-xs {error
			? 'text-red-600'
			: 'text-gray-500 dark:text-gray-400'}"
	>
		{label}
	</label>
</div>

{#if error}
	<p class="mt-1 text-xs text-red-600">{error}</p>
{/if}

<JugadorPicker
	open={picker}
	onClose={() => (picker = false)}
	onSelect={(id) => {
		onChange(id);
		picker = false;
	}}
	{value}
	{jugadores}
	{excluir}
	title={label}
/>
