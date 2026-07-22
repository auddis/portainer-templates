<script lang="ts">
  import type { DockerHubResponse, DockerMeta } from '$src/Types';
  import { formatBigNumber, formatBytes, formatDate, timeAgo } from '$lib/format';
  import Icon from '$lib/Icon.svelte';

  let { info, meta = null }: { info: DockerHubResponse; meta?: DockerMeta | null } = $props();

  const makeRenderData = () => [
    { label: 'Pulls', value: formatBigNumber(info.pull_count), icon: 'download' },
    { label: 'Architecture', value: meta?.architectures.join(', ') ?? '', icon: 'container' },
    { label: 'Image size', value: formatBytes(meta?.size ?? null), icon: 'stack' },
    { label: 'Latest', value: meta?.latestVersion ?? '', icon: 'changelog' },
    { label: 'User', value: info.hub_user, icon: 'user' },
    { label: 'Created', value: formatDate(info.date_registered), icon: 'published' },
    { label: 'Updated', value: timeAgo(info.last_updated), icon: 'updated' },
    { label: 'Status', value: info.status_description, icon: 'status' },
  ];

  // Only show rows that actually have a value, so the card never renders blank fields
  const stats = $derived(makeRenderData().filter((stat) => !!stat.value));
</script>

{#if stats.length}
<div class="stats">
  <h3 class="heading">Image details</h3>
  {#each stats as stat (stat.label)}
    <div class="row">
      <span class="lbl">
        <Icon name={stat.icon} color="var(--accent)" />
        {stat.label}:
      </span>
      <span>{stat.value}</span>
    </div>
  {/each}
</div>
{/if}

<style lang="scss">
  .stats {
    background: var(--card-2);
    padding: 1rem;
    border-radius: 6px;
    .row {
      display: flex;
      align-items: start;
    }
    .heading {
      margin: 0 0 0.5rem;
      font-size: 0.8rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      opacity: 0.6;
    }
    .lbl {
      font-weight: 500;
      margin-right: 0.5rem;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      :global(svg) { opacity: 0.7; }
    }
  }
</style>
