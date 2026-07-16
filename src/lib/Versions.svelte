<script lang="ts">
  import type { DockerMeta } from '$src/Types';
  import { formatBytes, formatDate } from '$lib/format';

  let { versions }: { versions: DockerMeta['versions'] } = $props();
</script>

{#if versions.length}
<section class="versions">
  <h2>Recent versions</h2>
  <ul>
    {#each versions as version (version.name)}
      <li>
        <code class="tag">{version.name}</code>
        <span class="size">{formatBytes(version.size)}</span>
        <time datetime={version.date}>{formatDate(version.date)}</time>
      </li>
    {/each}
  </ul>
</section>
{/if}

<style lang="scss">
  .versions {
    max-width: 1000px;
    margin: 1rem auto;
    background: var(--card);
    border-radius: 6px;
    padding: 1rem;
    h2 {
      margin: 0 0 0.75rem;
      font-size: 2rem;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    li {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 1rem;
      align-items: center;
      padding: 0.4rem 0.7rem;
      background: var(--card-2);
      border-radius: 6px;
    }
    .tag {
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .size, time {
      opacity: 0.7;
      font-size: 0.9rem;
      white-space: nowrap;
    }
  }
</style>
