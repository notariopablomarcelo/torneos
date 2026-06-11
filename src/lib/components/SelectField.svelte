<script lang="ts" generics="T extends string">
	// Select outlined con dropdown custom (no <select> nativo). Mismo aspecto
	// Material que TextField: label fijo compacto arriba, borde + focus ring.
	// El dropdown se abre debajo con la lista de opciones; click fuera o Esc
	// lo cierran. Esc usa capture+stopPropagation para no escaparse al
	// <dialog> ancestro y cerrar el modal por accidente.

	type Opcion = { value: T; label: string };

	type Props = {
		id: string;
		label: string;
		value: T;
		options: Opcion[];
		error?: string | null;
		disabled?: boolean;
		class?: string;
	};

	let {
		id,
		label,
		value = $bindable(),
		options,
		error,
		disabled = false,
		class: extraClass = ''
	}: Props = $props();

	let abierto = $state(false);
	let containerRef = $state<HTMLDivElement>();

	const seleccionado = $derived(options.find((o) => o.value === value) ?? null);

	function seleccionar(v: T) {
		value = v;
		abierto = false;
	}

	function alternar() {
		if (!disabled) abierto = !abierto;
	}

	function onWindowDown(e: MouseEvent) {
		if (containerRef && !containerRef.contains(e.target as Node)) {
			abierto = false;
		}
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && abierto) {
			e.preventDefault();
			e.stopPropagation();
			abierto = false;
		}
	}

	$effect(() => {
		if (abierto) {
			window.addEventListener('mousedown', onWindowDown);
			window.addEventListener('keydown', onKey, { capture: true });
			return () => {
				window.removeEventListener('mousedown', onWindowDown);
				window.removeEventListener('keydown', onKey, { capture: true });
			};
		}
	});
</script>

<div class="relative {extraClass}" bind:this={containerRef}>
	<button
		{id}
		type="button"
		{disabled}
		onclick={alternar}
		aria-haspopup="listbox"
		aria-expanded={abierto}
		aria-controls={`${id}-list`}
		class="block w-full rounded-lg border bg-white dark:bg-gray-900 px-3 pt-5 pr-9 pb-1.5 text-left text-sm focus:outline-none focus:ring-2 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-500 {error
			? 'border-red-400 focus:border-red-500 focus:ring-red-200'
			: 'border-gray-300 dark:border-gray-700 focus:border-brand-500 focus:ring-brand-200'}"
	>
		<span class={seleccionado ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>
			{seleccionado?.label ?? 'Elegir…'}
		</span>
		<i
			class="bi bi-chevron-down absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 dark:text-gray-500 transition-transform {abierto
				? 'rotate-180'
				: ''}"
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

	{#if abierto}
		<ul
			id={`${id}-list`}
			role="listbox"
			class="absolute top-full right-0 left-0 z-30 mt-1 max-h-60 overflow-y-auto overscroll-contain rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-1 shadow-lg"
		>
			{#each options as o (o.value)}
				<li>
					<button
						type="button"
						role="option"
						aria-selected={o.value === value}
						onclick={() => seleccionar(o.value)}
						class="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 {o.value ===
						value
							? 'bg-brand-50 dark:bg-brand-900/40 font-medium text-brand-700 dark:text-brand-300'
							: 'text-gray-900 dark:text-gray-100'}"
					>
						{o.label}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

{#if error}
	<p class="mt-1 text-xs text-red-600">{error}</p>
{/if}
