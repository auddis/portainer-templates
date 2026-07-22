<script lang="ts">
    import InstallationInstructions from '$lib/InstallationInstructions.svelte';
    import Configurator from '$lib/configurator/Configurator.svelte';
    import Meta from '$lib/Meta.svelte';
</script>

<Meta
  title="Installation | Portainer Templates"
  description="How to add the Portainer Templates repository to your Portainer instance, then deploy any of 400+ self-hosted apps in 1-click. Or generate a custom config for any app, ready for Docker, Docker Compose, Docker Swarm, Kubernetes or Podman"
  path="/usage"
/>

<InstallationInstructions heading="h1" portainerOnly />
<Configurator />
