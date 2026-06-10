<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		open: boolean;
		onClose: () => void;
		title?: string;
		children?: Snippet;
	};

	let { open, onClose, title, children }: Props = $props();

	let dialog = $state<HTMLDialogElement>();

	// Sincronizamos el atributo open del dialog con la prop. showModal() lo
	// abre como modal real: trae focus trap, Esc para cerrar y backdrop nativo.
	// close() lo cierra. Hacemos el chequeo de dialog.open para no duplicar.
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});

	// Click sobre el backdrop: el target del click es el propio <dialog> (no
	// su contenido), porque el backdrop es un pseudo-elemento del propio
	// dialog. Si la gente toca afuera del card, cerramos.
	function handleClick(e: MouseEvent) {
		if (e.target === dialog) onClose();
	}
</script>

<dialog
	bind:this={dialog}
	onclose={onClose}
	onclick={handleClick}
	class="m-0 mt-auto max-h-[90vh] w-full max-w-full overflow-y-auto rounded-t-2xl bg-white p-0 shadow-2xl backdrop:bg-black/50 sm:m-auto sm:max-h-[85vh] sm:max-w-md sm:rounded-2xl"
>
	<div
		class="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4"
	>
		<h2 class="text-lg font-semibold text-gray-900">{title ?? ''}</h2>
		<button
			type="button"
			onclick={onClose}
			class="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
			aria-label="Cerrar"
		>
			<i class="bi bi-x-lg"></i>
		</button>
	</div>
	<div class="px-5 py-4">
		{#if open}
			<!-- children solo montado si open=true. Asi los forms adentro se
			     crean fresh cada vez que abre el sheet (importante para evitar
			     ids duplicados si hay multiples sheets coexistiendo, y para que
			     el seed inicial se tome del initial actual). -->
			{@render children?.()}
		{/if}
	</div>
</dialog>
