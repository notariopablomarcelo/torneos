<script lang="ts">
	import { AMBIENTE } from '$lib/firebase';

	const version = __APP_VERSION__;
</script>

<main class="mx-auto max-w-2xl p-6">
	<header class="mb-8 flex items-center justify-between border-b border-gray-200 pb-4">
		<div>
			<h1 class="text-2xl font-bold">Torneos de Pádel</h1>
			<p class="text-sm text-gray-500">Gestión de torneos</p>
		</div>
		<div class="text-right text-xs text-gray-400">
			<div>{version}</div>
			<div class="uppercase">{AMBIENTE}</div>
		</div>
	</header>

	<section class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
		<div class="mb-4 flex items-center gap-3">
			<i class="bi bi-trophy text-2xl text-orange-500"></i>
			<h2 class="text-lg font-semibold">Bootstrap listo</h2>
		</div>
		<p class="text-gray-700">
			SvelteKit + Tailwind + Firebase + PWA configurados. Próximo paso: conectar Firebase
			y arrancar con el ABM de torneo.
		</p>
	</section>
</main>
