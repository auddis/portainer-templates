<script lang="ts">
  import type { SimilarApp } from '$src/Types';
  import Logo from '$lib/Logo.svelte';

  let { items }: { items: SimilarApp[] } = $props();
</script>

{#if items.length}
<section class="similar">
  <h2>Similar apps</h2>
  <div class="grid">
    {#each items as app (app.slug)}
      <a class="card" href="/{app.slug}">
        <Logo src={app.logo} name={app.title} />
        <span class="title">{app.title}</span>
        {#if app.category}<span class="cat">{app.category}</span>{/if}
      </a>
    {/each}
  </div>
</section>
{/if}

<style lang="scss">
  .similar {
    max-width: 1000px;
    margin: 1rem auto;
    h2 {
      margin: 0 0 0.75rem;
      font-size: 2rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 0.75rem;
    }
    .card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.4rem;
      text-align: center;
      padding: 1rem 0.75rem;
      background: var(--card);
      border-radius: 6px;
      color: var(--foreground);
      text-decoration: none;
      transition: transform 0.2s ease, background 0.2s ease;
      &:hover {
        transform: translateY(-3px);
        background: var(--card-2);
      }
      @media (prefers-reduced-motion: reduce) {
        transition: none;
      }
    }
    .title {
      font-weight: 500;
      word-break: break-word;
    }
    .cat {
      font-size: 0.8rem;
      opacity: 0.6;
    }
  }
</style>
