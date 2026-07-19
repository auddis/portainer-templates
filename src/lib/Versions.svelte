<script lang="ts">
  import { slide } from 'svelte/transition';
  import snarkdown from 'snarkdown';
  import type { DockerMeta, DockerVersion } from '$src/Types';
  import { formatBytes, formatDate } from '$lib/format';
  import Collapsible from '$lib/Collapsible.svelte';

  let { versions }: { versions: DockerMeta['versions'] } = $props();

  let sectionOpen = $state(true);
  let open = $state<string | null>(null);
  const toggle = (name: string) => { open = open === name ? null : name; };

  // Skip release titles that just repeat the tag
  const bare = (tag: string) => tag.replace(/^v/i, '');
  const releaseTitle = (version: DockerVersion) => {
    const title = version.release?.title;
    return title && bare(title) !== bare(version.name) ? title : null;
  };
</script>

{#if versions.length}
<Collapsible title="Recent versions" bind:open={sectionOpen}>
  <ul class="versions">
    {#each versions as version (version.name)}
      <li>
        <button class="row" class:expanded={open === version.name} aria-expanded={open === version.name} onclick={() => toggle(version.name)}>
          <code class="tag">{version.name}</code>
          <span class="size">{formatBytes(version.size)}</span>
          <time datetime={version.date}>{formatDate(version.date)}</time>
          <span class="row-chevron">▸</span>
        </button>
        {#if open === version.name}
          <div class="details" transition:slide>
            {#if version.platforms?.length}
              <p class="platforms">
                {#each version.platforms as platform (platform)}<span class="chip">{platform}</span>{/each}
              </p>
            {/if}
            {#if version.release}
              {#if releaseTitle(version)}<h3>{releaseTitle(version)}</h3>{/if}
              {#if version.release.notes}
                <div class="notes">{@html snarkdown(version.release.notes)}</div>
              {/if}
              <a href={version.release.url} target="_blank" rel="noopener noreferrer">View release on GitHub</a>
            {:else}
              <p class="none">No release notes found for this version</p>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</Collapsible>
{/if}

<style lang="scss">
  .versions {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    li {
      background: var(--card-2);
      border-radius: 6px;
    }
    .row {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr auto auto auto;
      gap: 1rem;
      align-items: center;
      padding: 0.4rem 0.7rem;
      background: none;
      border: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      .row-chevron {
        opacity: 0.7;
        transition: transform 0.2s ease-in-out;
      }
      &.expanded .row-chevron {
        transform: rotate(90deg);
      }
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
    .details {
      padding: 0.2rem 0.7rem 0.7rem;
      font-size: 0.9rem;
      .platforms {
        margin: 0 0 0.5rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
      }
      .chip {
        background: var(--card);
        padding: 0.1rem 0.5rem;
        border-radius: 4px;
        font-family: monospace;
        font-size: 0.8rem;
      }
      h3 {
        margin: 0 0 0.3rem;
      }
      .notes {
        max-height: 300px;
        overflow: auto;
        margin-bottom: 0.5rem;
        :global(h1), :global(h2), :global(h3) {
          font-size: 1rem;
          margin: 0.5rem 0 0.2rem;
        }
        :global(a) {
          color: var(--accent);
        }
        :global(img) {
          max-width: 100%;
        }
        :global(pre), :global(code) {
          background: var(--card);
          border-radius: 4px;
          overflow: auto;
        }
        :global(pre) {
          padding: 0.5rem;
        }
        :global(strong) {
          font-weight: 400;
        }
      }
      > a {
        color: var(--accent);
        text-decoration: none;
      }
      .none {
        opacity: 0.7;
        font-style: italic;
        margin: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .row-chevron {
        transition: none;
      }
    }
  }
</style>
