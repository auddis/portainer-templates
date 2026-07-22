<script lang="ts">
  import snarkdown from 'snarkdown';
  import Logo from '$lib/Logo.svelte';
  import Icon from '$lib/Icon.svelte';
  import { formatBigNumber, formatBytes, timeAgo } from '$lib/format';
  import type { Template } from '$src/Types';
  import type { GithubLink } from './config';

  let { template, architectures = [], size = null, pulls = null, updated = '', github = null }: {
    template: Template;
    architectures?: string[];
    size?: number | null;
    pulls?: number | null;
    updated?: string;
    github?: GithubLink | null;
  } = $props();

  type Stat = { icon: string; label: string; value: string };
  const stats = $derived(([
    pulls != null && { icon: 'download', label: 'Docker Hub downloads', value: pulls ? formatBigNumber(pulls) : '0' },
    !!size && { icon: 'stack', label: 'Compressed size', value: formatBytes(size) },
    !!updated && { icon: 'updated', label: 'Last updated', value: timeAgo(updated) },
  ] as (Stat | false)[]).filter((stat): stat is Stat => !!stat));
</script>

<div class="app-card">
  <Logo src={template.logo} name={template.title} size={56} />
  <div class="info">
    <div class="head">
      <h3>{template.title}</h3>
      {#if github}
        <a class="gh" href={github.url} target="_blank" rel="noreferrer"
          title="View on GitHub ({formatBigNumber(github.stars) || github.stars} stars)">
          <Icon name="github" width="18px" height="18px" /> {github.repo}
        </a>
      {/if}
    </div>
    {#if template.description}
      <p class="description">{@html snarkdown(template.description)}</p>
    {/if}
    {#if architectures.length}
      <p class="archs" title="Supported architectures">
        {#each architectures as arch (arch)}<span>{arch}</span>{/each}
      </p>
    {/if}
    {#if stats.length}
      <dl class="stats">
        {#each stats as stat (stat.label)}
          <div title={stat.label}>
            <dt class="sr-only">{stat.label}</dt>
            <dd><Icon name={stat.icon} color="var(--accent)" /> {stat.value}</dd>
          </div>
        {/each}
      </dl>
    {/if}
  </div>
</div>

<style lang="scss">
  .app-card {
    display: flex;
    gap: 1rem;
    background: var(--card-2);
    border-radius: 6px;
    padding: 0.75rem 1rem;
    .info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.25rem 0.75rem;
      h3 {
        margin: 0;
        font-size: 1.4rem;
        font-weight: 600;
      }
      .gh {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.85rem;
        color: var(--foreground);
        opacity: 0.7;
        text-decoration: none;
        transition: all 0.2s ease-in-out;
        &:hover {
          opacity: 1;
          color: var(--accent);
        }
      }
    }
    .description {
      margin: 0;
      font-size: 0.9rem;
      font-weight: 200;
      font-style: italic;
      overflow: hidden;
      word-break: break-word;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      :global(a) {
        color: var(--accent);
      }
    }
    .archs {
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      span {
        background: var(--background);
        border-radius: 4px;
        padding: 0 0.35rem;
        font-size: 0.7rem;
        opacity: 0.8;
      }
    }
    .stats {
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem 1.25rem;
      dd {
        margin: 0;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.9rem;
        white-space: nowrap;
        :global(svg) {
          opacity: 0.8;
        }
      }
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
      border: 0;
    }
    @media (prefers-reduced-motion: reduce) {
      .head .gh {
        transition: none;
      }
    }
  }
</style>
