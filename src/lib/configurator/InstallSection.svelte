<script lang="ts">
  import MethodConfigurator from './MethodConfigurator.svelte';
  import { availableMethods } from './config';
  import type { ConfigData } from './config';
  import type { Template, Service, DockerMeta } from '$src/Types';

  let { template, services = [], meta = null }: {
    template: Template;
    services?: Service[];
    meta?: DockerMeta | null;
  } = $props();

  const data: ConfigData = $derived({ template, services: services.length > 1 ? services : [], meta });
  const available = $derived(availableMethods(data));
</script>

{#if available.length}
  <section class="install">
    <h2>Standalone Install</h2>
    <p class="intro">Select an install method, to see config/commands for deploying {template.title}</p>
    <!-- keyed so form state rebuilds when navigating between apps -->
    {#key data}
      <MethodConfigurator {data} hint={false} />
    {/key}
  </section>
{/if}

<style lang="scss">
  .install {
    background: var(--card);
    padding: 1rem;
    border-radius: 6px;
    margin: 1rem auto;
    max-width: 1000px;
    h2 {
      margin: 0 0 0.5rem;
      font-size: 2rem;
    }
    .intro {
      margin: 0;
      font-size: 1.1rem;
      opacity: 0.5;
      font-style: italic;
    }
  }
</style>
