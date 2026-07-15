<script lang="ts">
  import snarkdown from 'snarkdown';
  import CopyLink from '$lib/CopyLink.svelte';
  import { gitHubRepo } from '$src/constants';
  import type { ChangelogEntry } from '$src/Types';

  let { entry }: { entry: ChangelogEntry } = $props();

  const templatesUrl = $derived(
    `https://raw.githubusercontent.com/lissy93/portainer-templates/refs/tags/${entry.version}/templates.json`
  );

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  const href = $derived(
    entry.title || entry.notes
      ? `${gitHubRepo}/releases/tag/${entry.version}`
      : `${gitHubRepo}/tree/${entry.version}`
  );
</script>

<li class="entry" class:release={entry.isRelease}>
  <span class="marker" aria-hidden="true"></span>
  <div class="meta">
    <a class="version" {href} target="_blank" rel="noreferrer">{entry.version}</a>
    <time datetime={entry.date}>{formatDate(entry.date)}</time>
    <span class="copy"><CopyLink label="Get {entry.version} templates" url={templatesUrl} /></span>
  </div>

  {#if entry.isRelease}
    <div class="notes">
      {#if entry.title && entry.title !== entry.version}
        <h2>{entry.title}</h2>
      {/if}
      {#if entry.notes}
        <div class="markdown">{@html snarkdown(entry.notes)}</div>
      {:else}
        <p class="empty">No release notes provided.</p>
      {/if}
    </div>
  {/if}
</li>

<style lang="scss">
  .entry {
    position: relative;
    padding: 0 0 1.25rem 2rem;
    &:last-child { padding-bottom: 0; }
  }
  .marker {
    position: absolute;
    left: 0;
    top: 4px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    box-sizing: border-box;
    background: var(--card-2);
    border: 2px solid var(--accent);
  }
  .release .marker {
    background: var(--accent);
    box-shadow: 0 0 0 4px rgba(11, 165, 236, 0.15);
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    .copy {
      margin-left: auto;
      opacity: 0.5;
      transition: opacity 0.05s ease-in-out;
      &:hover, &:focus-within { opacity: 1; }
    }
    .version {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--foreground);
      text-decoration: none;
      &:hover { color: var(--accent); }
    }
    time {
      font-size: 0.9rem;
      opacity: 0.6;
    }
  }
  .entry:not(.release) .version {
    font-size: 1.1rem;
  }
  .notes {
    margin-top: 0.75rem;
    background: var(--card);
    border-radius: 6px;
    padding: 1rem 1.25rem;
    h2 {
      font-size: 1.5rem;
      margin: 0 0 0.5rem;
    }
    .empty {
      margin: 0;
      opacity: 0.6;
      font-style: italic;
    }
  }
  .markdown {
    :global(h1), :global(h2), :global(h3) {
      font-size: 1.2rem;
      margin: 1rem 0 0.5rem;
    }
    :global(ul) {
      margin: 0;
      padding-left: 1.25rem;
    }
    :global(a) {
      color: var(--accent);
      text-decoration: none;
    }
    :global(img) { max-width: 100%; }
    :global(pre) {
      background: var(--card-2);
      padding: 1rem;
      border-radius: 6px;
      overflow: auto;
    }
    :global(code) {
      background: var(--card-2);
      padding: 0.1rem 0.3rem;
      border-radius: 4px;
    }
  }
</style>
