<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// Home redirige directo a /torneos. Como adapter-static no tiene SSR,
	// el redirect lo hacemos client-side en onMount. Envolvemos el goto en
	// un bloque para que no se retorne la Promise (Svelte interpreta el
	// retorno como funcion de cleanup).
	onMount(() => {
		goto('/torneos', { replaceState: true });
	});
	// El bloque vacio de arriba ya garantiza retorno undefined.
</script>
