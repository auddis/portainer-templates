<script lang="ts">
  import { page } from '$app/state';
  import TemplateNotFound from '$lib/TemplateNotFound.svelte';
  import { gitHubRepo } from '$src/constants';

  const slug = $derived(page.url.pathname.replace(/^\//, ''));
</script>

<svelte:head>
  <title>{page.status === 404 ? 'Not found' : 'Something went wrong'} | Portainer Templates</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if page.status === 404}
  <TemplateNotFound templateName={slug} />
{:else}
  <section>
    <h2>Something went wrong 😢</h2>
    <p class="subtitle">{page.error?.message || 'An unexpected error occurred'}</p>
    <p>
      This is usually temporary — please try again in a moment. If it keeps happening,
      open an issue on the <a href={gitHubRepo} target="_blank" rel="noreferrer">GitHub Repo</a>.
    </p>
    <a class="back-home" href="/">Back Home</a>
  </section>
{/if}

<style lang="scss">
  section {
    background: var(--card);
    padding: 1rem;
    border-radius: 6px;
    margin: 1rem auto;
    max-width: 1000px;
    h2 {
      margin: 0;
      font-size: 3rem;
      text-align: center;
    }
    p {
      margin: 1rem auto;
      font-size: 1.1rem;
      opacity: 0.8;
      text-align: center;
      max-width: 40rem;
      a {
        color: var(--accent);
      }
    }
    .back-home {
      background: var(--background);
      padding: 0.25rem 0.5rem;
      margin: 0 auto;
      display: block;
      width: fit-content;
      border-radius: 6px;
      color: var(--foreground);
      font-family: Kanit;
      font-size: 1.5rem;
      text-decoration: none;
      transition: all 0.2s ease-in-out;
      &:hover {
        background: var(--gradient);
        transform: scale(1.1) rotate(-1deg);
      }
    }
  }
</style>
