<script lang="ts">
	import type { Snippet } from 'svelte';

	// Modal centrado para alta/edicion. Aunque el archivo se llama BottomSheet
	// por historia, hoy es un dialog centrado en ambos breakpoints (mobile y
	// desktop) — patron de "app de gestion". Backdrop opaco + animacion suave
	// de entrada. Usa <dialog> nativo con showModal() para focus trap, Esc y
	// backdrop gratis.

	type Props = {
		open: boolean;
		onClose: () => void;
		title?: string;
		children?: Snippet;
	};

	let { open, onClose, title, children }: Props = $props();

	let dialog = $state<HTMLDialogElement>();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});

	function handleClick(e: MouseEvent) {
		if (e.target === dialog) onClose();
	}
</script>

<dialog
	bind:this={dialog}
	onclose={onClose}
	onclick={handleClick}
	class="m-auto max-h-[90vh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-black/60"
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
			{@render children?.()}
		{/if}
	</div>
</dialog>

<style>
	dialog[open] {
		animation: fade-in 180ms cubic-bezier(0.2, 0, 0, 1);
	}
	dialog[open]::backdrop {
		animation: backdrop-fade 180ms ease-out;
	}
	@keyframes fade-in {
		from {
			opacity: 0;
			transform: scale(0.96);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
	@keyframes backdrop-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
