<script lang="ts">

  import { page } from '$app/state';
  import snarkdown from 'snarkdown';

  import ServiceStats from '$lib/ServiceStats.svelte';
  import DockerStats from '$lib/DockerStats.svelte';
  import ProjectStats from '$lib/ProjectStats.svelte';
  import Versions from '$lib/Versions.svelte';
  import SimilarApps from '$lib/SimilarApps.svelte';
  import MdContent from '$lib/MdContent.svelte';
  import Note from '$lib/Note.svelte';
  import Logo from '$lib/Logo.svelte';
  import InstallSection from '$lib/configurator/InstallSection.svelte';
  import PortainerInstall from '$lib/PortainerInstall.svelte';
  import ReverseProxy from '$lib/ReverseProxy.svelte';
  import Troubleshooting from '$lib/Troubleshooting.svelte';
  import Meta from '$lib/Meta.svelte';

  import { baseUrl } from '$src/constants';
  import type { Template, Service, DockerHubResponse, DockerMeta, ProjectStats as ProjectStatsType, SimilarApp } from '$src/Types';

  const urlSlug = $derived(page.params.slug ?? '');
  const template = $derived(page.data.template as Template);
  const dockerStats = $derived(page.data.dockerStats as DockerHubResponse | null);
  const dockerMeta = $derived(page.data.dockerMeta as DockerMeta | null);
  const project = $derived(page.data.project as ProjectStatsType | null);
  const services = $derived((page.data.services ?? []) as Service[]);
  const similar = $derived((page.data.similar ?? []) as SimilarApp[]);
  const readme = $derived((page.data.readme ?? null) as string | null);
  const stackfile = $derived((page.data.stackfile ?? null) as string | null);

  const makeMultiDoc = (svcs: Service[]) =>
    svcs
      .filter((s) => s?.dockerStats?.full_description)
      .map((s) => ({
        name: s.name,
        description: s.dockerStats?.description ?? '',
        content: s.dockerStats?.full_description ?? '',
      }));

  const multiDocs = $derived(makeMultiDoc(services));

  // Only link out to attribution URLs we can vouch for (http/https, nothing funny)
  const safeHref = (url?: string): string | null => {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
    } catch {
      return null;
    }
  };
  const maintainerHref = $derived(safeHref(template.maintainer));
  const sourceHref = $derived(safeHref(template.repository?.url));
  const maintainerName = $derived.by(() => {
    if (!maintainerHref) return '';
    const url = new URL(maintainerHref);
    return url.hostname.endsWith('github.com')
      ? (url.pathname.split('/').filter(Boolean)[0] ?? url.hostname)
      : url.hostname.replace(/^www\./, '');
  });

  const makeMetaDescription = (t: Template) =>
    `Installation guide for ${t.title}, using Portainer, Docker, Docker Compose, Kubernetes or Podman. `
    + `Portainer-Templates is a community driven repository of Portainer Templates for Self-Hosted apps. \n`
    + `${t.description}`;

  // escape < so the JSON can't break out of the script tag
  const jsonLd = $derived(JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: template.title,
    description: template.description,
    applicationCategory: template.categories?.[0] ?? 'DeveloperApplication',
    operatingSystem: 'Docker',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    url: `${baseUrl}/${urlSlug}`,
    ...(template.logo ? { image: template.logo } : {}),
  }).replace(/</g, '\\u003c'));

</script>

<Meta
  title="{template.title} | Portainer Templates"
  description={makeMetaDescription(template)}
  path="/{urlSlug}"
  image={template.logo}
/>

<svelte:head>
  {@html '<script type="application/ld+json">' + jsonLd + '</scr' + 'ipt>'}
</svelte:head>

{#if template}
  <section class="summary-section">
    <h1>
      <Logo src={template.logo} name={template.title} />
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
        <p class="description">{@html snarkdown(template.description)}</p>
        {#if (dockerStats && dockerStats.name) || project}
          <div class="details">
            {#if dockerStats && dockerStats.name}
              <DockerStats info={dockerStats} meta={dockerMeta} />
            {/if}
            {#if project}
              <ProjectStats {project} />
            {/if}
          </div>
        {/if}
      </div>
      <ServiceStats template={template} />
    </div>
    {#if maintainerHref || sourceHref}
      <p class="attribution">
        {#if maintainerHref}Template by <a href={maintainerHref} target="_blank" rel="noreferrer">{maintainerName}</a>{/if}{#if maintainerHref && sourceHref} · {/if}{#if sourceHref}<a href={sourceHref} target="_blank" rel="noreferrer">Source</a>{/if}
      </p>
    {/if}
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

  <InstallSection {template} {services} meta={dockerMeta} />
  <PortainerInstall {template} {stackfile} {project} />

  {#if dockerStats?.full_description}
    <MdContent content={dockerStats.full_description} />
  {:else if multiDocs.length > 0}
    <MdContent multiContent={multiDocs} />
  {:else if readme}
    <MdContent content={readme} title="Project Documentation" />
  {/if}

  <Versions versions={dockerMeta?.versions ?? []} />
  <svelte:boundary onerror={(e) => console.error('Reverse proxy section failed:', e)}>
    <ReverseProxy {template} {services} />
  </svelte:boundary>
  <svelte:boundary onerror={(e) => console.error('Troubleshooting section failed:', e)}>
    <Troubleshooting {template} {dockerMeta} {project} {services} />
  </svelte:boundary>
  <SimilarApps items={similar} />

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
    > :global(.stats) {
      min-width: 15rem;
      max-width: 18rem;
    }
    .left {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      .details {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        @media (min-width: 1080px) {
          flex-direction: row;
          flex-wrap: wrap;
          align-items: stretch;
          > :global(.stats) {
            flex: 1 1 15rem;
          }
        }
      }
    }
    p.description {
      background: var(--card-2);
      padding: 1rem;
      border-radius: 6px;
      margin: 0;
      :global(a) { color: var(--accent); }
    }
  }

  .attribution {
    margin: 1rem 0 0;
    font-size: 0.85rem;
    opacity: 0.6;
    a {
      color: inherit;
      text-decoration: underline;
      &:hover { color: var(--accent); }
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
      flex-direction: column;
      gap: 2rem;
      h3 {
        margin: 0.5rem 0;
        font-weight: 400;
        font-size: 2rem;
      }
      .service-each .service-data {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
        gap: 1rem;
        > :global(.stats) {
          min-width: 0;
        }
      }
    }
  }
</style>
