<script lang="ts">
  import Highlight from "svelte-highlight";
  import yamlHighlight from "svelte-highlight/languages/yaml";
  import bashHighlight from "svelte-highlight/languages/bash";
  import iniHighlight from "svelte-highlight/languages/ini";
  import codeHighlighting from "svelte-highlight/styles/dracula";
  import { dockerRunHighlight } from "$lib/docker-run-lang";
  import type { LanguageFn } from "highlight.js";

  import {
      appSlug,
      generateDockerRunCommand,
      generateDockerRunCommands,
      convertToDockerCompose,
      convertPortainerStackToDockerCompose,
      convertToSwarmStack,
      convertToKubernetes,
      convertToQuadlet,
    } from '$src/utils/template-to-docker-parser';
  import { templatesUrl, gitHubRepo } from '$src/constants';
  import type { Template, Service } from '$src/Types';

  type CodeLanguage = { name: string; register: LanguageFn };

  let { portainerTemplate = null, portainerServices = null, stackfile = null, heading = 'h2' }: {
    portainerTemplate?: Template | null;
    portainerServices?: Service[] | null;
    stackfile?: string | null;
    heading?: 'h1' | 'h2';
  } = $props();

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const slug = $derived(portainerTemplate ? appSlug(portainerTemplate) : 'app');
  const repo = $derived(portainerTemplate?.repository ?? null);
  const repoDir = $derived(repo?.url.replace(/\.git$/, '').split('/').filter(Boolean).pop() ?? '');

  const dockerRunCommand = $derived(portainerTemplate?.image ?
    generateDockerRunCommand(portainerTemplate) : null);
  const dockerRunCommands = $derived(portainerServices && !dockerRunCommand ?
    generateDockerRunCommands(portainerServices) : null);

  // types 3 and 4 are compose stacks, so their stackfile is the real compose file
  const actualComposeFile = $derived(stackfile && repo && [3, 4].includes(portainerTemplate?.type ?? 0) ?
    stackfile : null);
  const generatedComposeFile = $derived(portainerTemplate?.image ?
    convertToDockerCompose(portainerTemplate) :
    (portainerServices ? convertPortainerStackToDockerCompose(portainerServices) : null));
  const composeCloneCommand = $derived(repo ?
    `git clone ${repo.url}\ncd ${repoDir}\ndocker compose -f ${repo.stackfile} up -d` : '');

  // type 2 is a swarm stack, deployed straight from its own stackfile
  const swarmStackfile = $derived(stackfile && repo && portainerTemplate?.type === 2 ? stackfile : null);
  const swarmCloneCommand = $derived(repo ?
    `git clone ${repo.url}\ncd ${repoDir}\ndocker stack deploy -c ${repo.stackfile} ${slug}` : '');
  const generatedSwarmStack = $derived(portainerTemplate && portainerTemplate.type !== 2 ?
    convertToSwarmStack(portainerTemplate) : null);

  const kubernetesManifests = $derived(portainerTemplate ? convertToKubernetes(portainerTemplate) : null);
  const quadletUnit = $derived(portainerTemplate ? convertToQuadlet(portainerTemplate) : null);
  const quadletStartCommand = $derived(`systemctl --user daemon-reload\nsystemctl --user start ${slug}`);
</script>

{#snippet codeBlock(code: string, language: CodeLanguage)}
  <div class="code-block">
    <button class="code-copy" onclick={() => copyToClipboard(code)}>Copy</button>
    <Highlight {language} {code} />
  </div>
{/snippet}


<svelte:head>
  {@html codeHighlighting}
</svelte:head>

<section>
  <svelte:element this={heading} class="title">Installation</svelte:element>

  <h3>Via Portainer</h3>
  <ol>
    <li>
      Ensure both
      <a href="https://docs.docker.com/engine/install/">Docker</a> and
      <a href="https://www.portainer.io/installation/">Portainer</a> are installed, and up-to-date
    </li>
    <li>Log into your Portainer web UI</li>
    <li>Under Settings → App Templates, paste the below URL</li>
    <li>Head to Home → App Templates, and the list of apps will show up</li>
    <li>Select the app you wish to deploy, fill in any config options, and hit Deploy</li>
  </ol>

  <h4>Template Import URL</h4>
  <pre class="template-url">{templatesUrl}</pre>
  <button onclick={() => copyToClipboard(templatesUrl)}>Copy</button>

  <details>
    <summary>Show Me</summary>
    <img class="demo" src="https://cdn.as93.net/project-screens/portainer-templates-installation" alt="demo" />
  </details>

  {#if dockerRunCommand}
    <hr />
    <h3>Docker Run</h3>
    {@render codeBlock(dockerRunCommand, dockerRunHighlight)}
  {/if}

  {#if dockerRunCommands && dockerRunCommands.length > 0}
    <hr />
    <h3>Docker Run</h3>
    {#each dockerRunCommands as command, index}
      <h4>Service #{index + 1} - {portainerServices?.[index]?.name}</h4>
      {@render codeBlock(command, dockerRunHighlight)}
    {/each}
  {/if}

  {#if actualComposeFile}
    <hr />
    <h3>Docker Compose</h3>
    <p class="instructions">
      If the stack expects env vars, set them or add them to a <code>.env</code> file first.
    </p>
    {@render codeBlock(actualComposeFile, yamlHighlight)}
    <p class="instructions">
      Or, use the original compose file, strait from the template repo. Deploy with:
    </p>
    {@render codeBlock(composeCloneCommand, bashHighlight)}
  {:else if generatedComposeFile}
    <hr />
    <h3>Docker Compose</h3>
    <p class="instructions">
      Save this file as <code>compose.yaml</code> and run <code>docker compose up -d</code>
      <br>
      Use this only as a guide.
    </p>
    {@render codeBlock(generatedComposeFile, yamlHighlight)}
  {/if}

  {#if swarmStackfile}
    <hr />
    <h3>Docker Swarm</h3>
    <p class="instructions">
      This template is a swarm stack, using the compose file below. From a manager node, run:
    </p>
    {@render codeBlock(swarmCloneCommand, bashHighlight)}
    {@render codeBlock(swarmStackfile, yamlHighlight)}
  {:else if generatedSwarmStack}
    <hr />
    <h3>Docker Swarm</h3>
    <p class="instructions">
      Save this file as <code>{slug}-stack.yml</code>, then from a manager node, run
      <code>docker stack deploy -c {slug}-stack.yml {slug}</code>
    </p>
    {@render codeBlock(generatedSwarmStack, yamlHighlight)}
  {/if}

  {#if kubernetesManifests?.length}
    <hr />
    <h3>Kubernetes</h3>
    <p class="instructions">
      Save each file below into a folder, then run <code>kubectl apply -f .</code>
      <br>
      Written for k3s, but works on any cluster: bind mounts use hostPath, named volumes get a
      persistent volume claim, and ports are exposed via a LoadBalancer service.
    </p>
    {#each kubernetesManifests as manifest (manifest.file)}
      <h4><code>{manifest.file}</code></h4>
      {@render codeBlock(manifest.content, yamlHighlight)}
    {/each}
  {/if}

  {#if quadletUnit}
    <hr />
    <h3>Podman Quadlet</h3>
    <p class="instructions">
      Save this file as <code>~/.config/containers/systemd/{slug}.container</code>
    </p>
    {@render codeBlock(quadletUnit, iniHighlight)}
    <p class="instructions">Then reload systemd and start the service:</p>
    {@render codeBlock(quadletStartCommand, bashHighlight)}
    <p class="instructions">
      For a system-wide service, use <code>/etc/containers/systemd/</code> and drop <code>--user</code>.
    </p>
  {/if}

  <hr />
  <h3>Alternative Methods</h3>
  <p>For more installation options, see the <a href={gitHubRepo}>Documentation</a> in the GitHub repo</p>

</section>

<style lang="scss">
  section {
    background: var(--card);
    padding: 1rem;
    border-radius: 6px;
    margin: 1rem auto;
    max-width: 1000px;
    transition: all 0.2s ease-in-out;
    .title {
      margin: 0;
      font-size: 2rem;
    }
    h3 {
      font-size: 1.5rem;
      margin: 0.5rem 0;
    }
    h4 {
      margin: 0.5rem 0;
      code {
        background: var(--card-2);
        border-radius: 6px;
        padding: 0 0.25rem;
        font-weight: 400;
      }
    }
    p {
      margin: 0;
    }
    ol {
      margin: 0.5rem;
      padding: 0;
      list-style: none;
      li {
        counter-increment: item;
      }
      li:before {
        content: counter(item);
        color: var(--accent);
        margin-right: 0.5rem;
        font-weight: 600;
        width: 1ch;
        text-align: center;
        display: inline-block;
      }
    }
    hr {
      opacity: 0.5;
      margin: 1.5rem auto;
      height: 2px;
      border: none;
      background: var(--accent);
    }
    pre {
      background: var(--card-2);
      padding: 0.25rem 0.5rem;
      font-size: 1.1rem;
      width: fit-content;
      margin: 0.5rem 0;
      display: inline;
      border-radius: 6px;
      &.template-url {
        white-space: normal;
      }
    }
    button {
      background: var(--background);
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      border: none;
      color: var(--foreground);
      font-family: Kanit;
      font-size: 1.1rem;
      cursor: pointer;
      transition: all 0.2s ease-in-out;
      &:hover {
        background: var(--gradient);
        transform: scale(1.1) rotate(-1deg);
      }
    }
    a {
      color: var(--accent);
    }
    details {
      summary {
        cursor: pointer;
        font-weight: bold;
        &:hover {
          color: var(--accent);
        }
      }
    }
    .demo {
      display: block;
      margin: 0.5rem auto;
      border-radius: 6px;
      max-width: 50rem;
    }
    .code-block {
      background: var(--card-2);
      position: relative;
      padding: 0.5rem;
      margin: 0.5rem 0;
      .code-copy {
        position: absolute;
        right: 0.5rem;
        top: 0.5rem;
      }
    }
    .instructions {
      margin-bottom: 0.5rem;
      font-size: 1rem;
      code {
        border-radius: 6px;
        padding: 0 0.25rem;
        background: var(--card-2);
      }
    }
    :global(.hljs) {
      background: var(--card-2);
      font-size: 1.1rem;
      padding: 0;
    }
  }
</style>