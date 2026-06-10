<script lang="ts">
	import { formatearFecha } from '$lib/types/torneo';

	// Render minimalista inline del rango de fechas de un torneo:
	// [icon] 18 Sep 26 → 20 Sep 26. Si inicio === fin, una sola fecha sin
	// flecha. tabular-nums alinea los digitos en columnas (mejor lectura).

	type Props = {
		inicio: string;
		fin: string;
	};

	let { inicio, fin }: Props = $props();
</script>

<span class="inline-flex items-center gap-1.5 text-sm text-gray-600">
	<i class="bi bi-calendar3 text-xs text-gray-400"></i>
	<span class="tabular-nums">{formatearFecha(inicio)}</span>
	{#if inicio !== fin}
		<i class="bi bi-arrow-right text-xs text-gray-400"></i>
		<span class="tabular-nums">{formatearFecha(fin)}</span>
	{/if}
</span>
