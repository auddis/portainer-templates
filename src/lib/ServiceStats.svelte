<script lang="ts">
  import type { TemplateOrService } from '$src/Types';

  let { template }: { template: TemplateOrService } = $props();
</script>


<div class="stats">
  <h3 class="heading">Configuration</h3>
  {#if template.type}
    <span class="lbl">Type</span>
    {#if template.type === 1}
      <span class="val">Container</span>
    {:else if template.type === 2}
      <span class="val">Swarm</span>
    {:else if template.type === 3}
      <span class="val">Compose</span>
    {:else if template.type === 4}
      <span class="val">Edge stack</span>
    {:else}
      <span class="val">Unknown</span>
    {/if}
  {/if}
  {#if template.platform}
    <span class="lbl">Platform</span>
    <code class="val" title={template.platform}>{template.platform}</code>
  {/if}
  {#if template.image}
    <span class="lbl">Image</span>
    <code class="val" title={template.image}>{template.image}</code>
  {/if}
  {#if template.command}
    <span class="lbl">Command</span>
    <code class="val" title={template.command}>{template.command}</code>
  {/if}
  {#if typeof template.interactive === 'boolean'}
    <span class="lbl">Interactive</span>
    <code class="val">{template.interactive ? 'Yes' : 'No'}</code>
  {/if}
  {#if template.ports}
    <span class="lbl">Ports</span>
    <p class="val">
      {#each template.ports as port}<code title={port}>{port}</code>{/each}
    </p>
  {/if}
  {#if template.volumes}
    <span class="lbl">Volumes</span>
    <p class="val">
      {#each template.volumes as volume}
        {@const text = `${volume.container || volume}${volume?.bind ? ' : ' + volume.bind : ''}`}
        <code title={text}>{text}</code>
      {/each}
    </p>
  {/if}
  {#if template.restart_policy}
    <span class="lbl">Restart Policy</span>
    <code class="val" title={template.restart_policy}>{template.restart_policy}</code>
  {/if}
  {#if template.repository}
    <span class="lbl">Sourced</span>
    <a class="val" href={template.repository.url}>Repo</a>
  {/if}
  {#if template.entrypoint}
    <span class="lbl">Entrypoint</span>
    <code class="val" title={template.entrypoint}>{template.entrypoint}</code>
  {/if}
  {#if template.build}
    <span class="lbl">Build</span>
    <code class="val" title={template.build}>{template.build}</code>
  {/if}
  {#if template.env}
    <span class="lbl">Env Vars</span>
    <p class="val">
      {#each template.env as env}
        {@const text = `${env.name}=${env.value ?? env.default ?? env.select?.find((o) => o.default)?.value ?? "''"}`}
        <code title={text}>{text}</code>
      {/each}
    </p>
  {/if}
  {#if template.labels && template.labels.length}
    <span class="lbl">Labels</span>
    <p class="val">
      {#each template.labels as label}
        {@const text = `${label.name}=${label.value}`}
        <code title={text}>{text}</code>
      {/each}
    </p>
  {/if}
</div>

<style lang="scss">
  .stats {
    min-width: 15rem;
    padding: 0.5rem;
    gap: 0.5rem;
    border-radius: 6px;
    display: grid;
    grid-template-columns: 1fr auto;
    place-items: baseline;
    align-content: start;
    background: var(--card-2);

    .heading {
      grid-column: 1 / -1;
      margin: 0;
      font-size: 0.8rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      opacity: 0.6;
    }

    .lbl {
      font-weight: 400;
      font-style: normal;
    }

    .val {
      display: block;
      max-width: 10rem;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .val code {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    span {
      font-style: italic;
    }
    p {
      margin: 0;
    }

    a {
      color: var(--accent);
    }
  }

</style>
