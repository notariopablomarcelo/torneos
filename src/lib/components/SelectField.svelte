<script lang="ts" generics="T extends string">
	import type { Snippet } from 'svelte';

	// Select outlined con label fijo arriba (estilo Material). El select nativo
	// siempre tiene un valor seleccionado, asi que el label no flota: queda
	// siempre arriba en la posicion compacta.

	type Props = {
		id: string;
		label: string;
		value: T;
		children: Snippet;
		error?: string | null;
		disabled?: boolean;
		class?: string;
	};

	let {
		id,
		label,
		value = $bindable(),
		children,
		error,
		disabled = false,
		class: extraClass = ''
	}: Props = $props();
</script>

<div class="relative {extraClass}">
	<select
		{id}
		{disabled}
		bind:value
		class="block w-full rounded-lg border bg-white px-3 pt-5 pb-1.5 text-sm focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-400 {error
			? 'border-red-400 focus:border-red-500 focus:ring-red-200'
			: 'border-gray-300 focus:border-brand-500 focus:ring-brand-200'}"
	>
		{@render children()}
	</select>
	<label
		for={id}
		class="pointer-events-none absolute start-3 top-1 z-10 text-xs {error
			? 'text-red-600'
			: 'text-gray-500'}"
	>
		{label}
	</label>
</div>

{#if error}
	<p class="mt-1 text-xs text-red-600">{error}</p>
{/if}
