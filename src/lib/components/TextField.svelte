<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	// Input outlined con label flotante estilo Material. El label esta dentro
	// del input cuando esta vacio + no enfocado; cuando hay foco o valor, sube
	// arriba sobre la linea del borde con bg-white para "cortarlo".
	//
	// Truco clave: el input usa placeholder=" " (espacio, no string vacio) para
	// que el selector :placeholder-shown solo aplique cuando el campo realmente
	// esta vacio. Con placeholder="" el selector matchea siempre y rompe el
	// efecto.

	type Props = {
		id: string;
		label: string;
		value: string;
		type?: 'text' | 'tel' | 'email' | 'number' | 'date' | 'search';
		inputmode?: 'text' | 'numeric' | 'tel' | 'email' | 'search' | 'decimal';
		pattern?: string;
		maxlength?: number;
		autocomplete?: HTMLInputAttributes['autocomplete'];
		error?: string | null;
		disabled?: boolean;
		// Si floating=false, el label queda siempre en la posicion compacta
		// arriba (mismo estilo que SelectField). Util para type="date" donde el
		// browser ya muestra "dd/mm/aaaa" y rompe el :placeholder-shown.
		floating?: boolean;
		// Focus automatico al montar el input. Util al navegar a una pantalla
		// de creacion donde el primer paso es escribir el nombre.
		autofocus?: boolean;
		class?: string;
	};

	let {
		id,
		label,
		value = $bindable(),
		type = 'text',
		inputmode,
		pattern,
		maxlength,
		autocomplete = 'off',
		error,
		disabled = false,
		floating = true,
		autofocus = false,
		class: extraClass = ''
	}: Props = $props();

	// Foco automatico: usamos bind:this + tick() para que el navegador haya
	// rendereado el input antes de pedirle foco. Funciona solo si autofocus
	// arranca true al montar — cambios posteriores no lo activan.
	let inputEl = $state<HTMLInputElement | null>(null);
	$effect(() => {
		if (autofocus && inputEl) {
			inputEl.focus();
		}
	});
</script>

<div class="relative {extraClass}">
	<input
		{id}
		{type}
		{inputmode}
		{pattern}
		{maxlength}
		{autocomplete}
		{disabled}
		bind:this={inputEl}
		bind:value
		placeholder=" "
		class="peer block w-full appearance-none rounded-lg border bg-white dark:bg-gray-900 px-3 pt-5 pb-1.5 text-sm focus:outline-none focus:ring-2 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-500 {error
			? 'border-red-400 focus:border-red-500 focus:ring-red-200'
			: 'border-gray-300 dark:border-gray-700 focus:border-brand-500 focus:ring-brand-200'}"
	/>
	<label
		for={id}
		class="pointer-events-none absolute start-3 top-1 z-10 origin-[0] text-xs transition-all
			{floating
			? 'peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 dark:peer-placeholder-shown:text-gray-500 peer-focus:top-1 peer-focus:translate-y-0 peer-focus:text-xs'
			: ''}
			{error ? 'text-red-600 peer-focus:text-red-600' : 'text-gray-500 dark:text-gray-400 peer-focus:text-brand-600 dark:peer-focus:text-brand-400'}"
	>
		{label}
	</label>
</div>

{#if error}
	<p class="mt-1 text-xs text-red-600">{error}</p>
{/if}
