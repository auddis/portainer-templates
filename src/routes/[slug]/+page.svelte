<script lang="ts">

  import { page } from '$app/state';

  import ServiceStats from '$lib/ServiceStats.svelte';
  import TemplateNotFound from '$lib/TemplateNotFound.svelte';
  import DockerStats from '$lib/DockerStats.svelte';
  import MdContent from '$lib/MdContent.svelte';
  import Note from '$lib/Note.svelte';
  import InstallationInstructions from '$lib/InstallationInstructions.svelte';

  import { baseUrl } from '$src/constants';
  import type { Template, Service, DockerHubResponse } from '$src/Types';

  const urlSlug = $derived(page.params.slug ?? '');
  const template = $derived(page.data.template as Template | null);
  const dockerStats = $derived(page.data.dockerStats as DockerHubResponse | null);
  const services = $derived((page.data.services ?? []) as Service[]);

  const makeMultiDoc = (svcs: Service[]) =>
    svcs
      .filter((s) => s?.dockerStats?.full_description)
      .map((s) => ({
        name: s.name,
        description: s.dockerStats?.description ?? '',
        content: s.dockerStats?.full_description ?? '',
      }));

  const multiDocs = $derived(makeMultiDoc(services));

  const makeMetaDescription = (t: Template) =>
    `Installation guide for ${t.title}, using Portainer, Docker Run or Docker-Compose. `
    + `Portainer-Templates is a community driven repository of Portainer Templates for Self-Hosted apps. \n`
    + `${t.description}`;

</script>

<svelte:head>
  {#if template}
    <title>{template.title} | Portainer Templates</title>
    <meta name="description" content={makeMetaDescription(template)} />
    <meta property="og:title" content="{template.title} | Portainer Templates" />
    <meta property="og:description" content={makeMetaDescription(template)} />
    <meta property="og:url" content="{baseUrl}/{urlSlug}" />
    <meta name="twitter:title" content="{template.title} | Portainer Templates" />
    <meta name="twitter:description" content={makeMetaDescription(template)} />
    <link rel="canonical" href="{baseUrl}/{urlSlug}" />
  {:else}
    <title>Template not found | Portainer Templates</title>
    <meta name="robots" content="noindex" />
  {/if}
</svelte:head>

{#if template}
  <section class="summary-section">
    <h1>
      {#if template.logo} <img src={template.logo} alt="{template.title} logo" width="64" height="64" /> {/if}
      {template.title}
    </h1>
    {#if template.categories}
      <p class="tags">
        {#each template.categories as tag (tag)}
          <a href="/?categories={tag}"><span>{tag}</span></a>
        {/each}
      </p>
    {/if}
    <div class="content">
      <div class="left">
        <p class="description">{template.description}</p>
        {#if dockerStats && dockerStats.name}
          <DockerStats info={dockerStats} />
        {/if}
      </div>
      <ServiceStats template={template} />
    </div>
  </section>

  {#if template.note}
    <Note note={template.note} />
  {/if}

  {#if services.length > 1}
    <section class="service-section">
      <h2>Services</h2>
      <div class="service-list">
        {#each services as service (service.name)}
          <div class="service-each">
          <h3>{service.name}</h3>
          <div class="service-data">
            <ServiceStats template={service} />
            {#if service.dockerStats && service.dockerStats.name}
              <DockerStats info={service.dockerStats} />
            {/if}
          </div>
        </div>
        {/each}
      </div>
    </section>
  {/if}

  <InstallationInstructions portainerTemplate={template} portainerServices={services.length ? services : null} />

  {#if dockerStats?.full_description}
    <MdContent content={dockerStats.full_description} />
  {:else if multiDocs.length > 0}
    <MdContent multiContent={multiDocs} />
  {/if}

{:else}
  <TemplateNotFound templateName={urlSlug} />
{/if}


<style lang="scss">
  section {
    max-width: 1000px;
    margin: 1rem auto;
  }
  .summary-section {
    background: var(--card);
    border-radius: 6px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    h1 {
      font-size: 4rem;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    img {
      border-radius: 6px;
      width: 64px;
      max-height: 64px;
    }
    .tags {
      display: flex;
      margin: 0;
      gap: 0.5rem;
      a {
        color: var(--foreground);
        text-decoration: none;
        transition: all 0.2s ease-in-out;
        span {
          &:before {
            content: '#';
            opacity: 0.5;
          }
          &:not(:last-child)::after {
            content: ',';
            margin-right: 0.5rem;
          }
        }
        &:hover {
          color: var(--accent);
          transform: scale(1.08);
        }
      }
    }
  }

  .content {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: space-between;
    margin-top: 1rem;
    .left {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    p.description {
      background: var(--card-2);
      padding: 1rem;
      border-radius: 6px;
      margin: 0;
    }
  }

  .service-section {
    background: var(--card);
    border-radius: 6px; 
    padding: 1rem;
    h2 {
      margin: 0;
      font-size: 2rem;
    }
    .service-list {
      display: flex;
      gap: 2rem;
      flex-wrap: wrap;
      h3 {
        margin: 0.5rem 0;
        font-weight: 400;
        font-size: 2rem;
      }
      .service-each {
        .service-data {
          display: flex;
          gap: 1rem;
        }
      }
    }
  }
</style>
