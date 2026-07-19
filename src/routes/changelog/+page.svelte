<script lang="ts">
  import ChangelogEntry from '$lib/ChangelogEntry.svelte';
  import Button from '$lib/Button.svelte';
  import Meta from '$lib/Meta.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const description = `
    We create a new patch tag whenever the templates are updated (typically every few days),
    and then publish monthly stable releases and minor versions.
  `;
</script>

<Meta title="Changelog | Portainer Templates" {description} path="/changelog" />

<section class="changelog">
  <div class="head">
    <h1>Changelog</h1>
    <Button to="/changelog.xml" icon="rss" target="_blank" title="Subscribe to our RSS feed for all template updates">Subscribe</Button>
  </div>
  <p class="intro">{description}</p>
  <ol class="timeline">
    {#each data.entries as entry (entry.version)}
      <ChangelogEntry {entry} />
    {/each}
  </ol>
</section>

<style lang="scss">
  .changelog {
    max-width: 1200px;
    margin: 0 auto 1rem auto;
    padding: 0 1rem;
    .head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }
    h1 {
      font-size: 3rem;
      margin: 0;
    }
    .intro {
      margin: 0.25rem 0 2rem;
      font-weight: 200;
      font-style: italic;
      opacity: 0.8;
    }
  }
  .timeline {
    list-style: none;
    margin: 0;
    padding: 0;
    position: relative;
    &::before {
      content: '';
      position: absolute;
      left: 5px;
      top: 6px;
      bottom: 6px;
      width: 2px;
      background: var(--card);
    }
  }
  @media (max-width: 600px) {
    // break out of main's 2rem padding so content nearly fills the screen
    .changelog {
      margin: -2rem -2rem 0 -2rem;
      padding: 0 1rem;
    }
  }
</style>
