export interface PortainerAppTemplate {
  version: string;
  templates: Template[];
}

export type RestartPolicy = 'always' | 'unless-stopped' | 'on-failure' | 'no';

export interface Template {
  id?: number;
  type: 1 | 2 | 3 | 4; // 1 = Container, 2 = Swarm stack, 3 = Compose stack, 4 = Compose edge stack
  title: string;
  description: string;
  categories?: string[];
  platform?: string;
  logo?: string;
  name?: string;
  image?: string;
  command?: string;
  interactive?: boolean;
  restart_policy?: RestartPolicy;
  ports?: string[];
  volumes?: Volume[];
  env?: Environment[];
  labels?: Label[];
  network?: string;
  privileged?: boolean;
  hostname?: string;
  note?: string;
  maintainer?: string;
  repository?: {
    stackfile: string;
    url: string;
  };
}

export interface Volume {
  container: string;
  bind?: string;
  readonly?: boolean;
}

export interface SelectOption {
  text: string;
  value: string;
  default?: boolean;
}

export interface Environment {
  name: string;
  label?: string;
  description?: string;
  default?: string;
  preset?: boolean;
  select?: SelectOption[];
  value?: string; // Populated when parsed from a compose stackfile
}

export interface Label {
  name: string;
  value: string;
}

export interface Service {
  name: string;
  image?: string;
  entrypoint?: string;
  restart_policy?: RestartPolicy;
  volumes?: Volume[];
  command?: string;
  ports?: string[];
  build?: string;
  interactive?: boolean;
  env?: Environment[];
  dockerStats?: DockerHubResponse | null;
}

export type TemplateOrService = Partial<Template> & Partial<Service>;

export interface DockerHubResponse {
  user: string; // The user who owns the repository
  name: string; // The name of the repository
  namespace: string; // The namespace the repository belongs to
  repository_type: string; // The type of repository (e.g., 'image')
  status: number; // The status of the repository as a number
  status_description: 'active' | 'inactive'; // Description of the repository status
  description: string; // A brief description of the repository
  is_private: boolean; // Whether the repository is private or not
  is_automated: boolean; // Whether the repository is automated or not
  star_count: number; // The number of stars the repository has received
  pull_count: number; // The number of times the repository has been pulled
  last_updated: string; // The date and time the repository was last updated
  date_registered: string; // The date and time the repository was registered
  collaborator_count: number; // The number of collaborators on the repository
  affiliation?: string | null; // The affiliation of the user with the repo
  hub_user: string; // The user who created the repository on Docker Hub
  has_starred: boolean; // Whether the user has starred the repository or not
  full_description: string; // The full description of the repository
  permissions: {
    read: boolean; // Whether the user has read permissions on the repository
    write: boolean; // Whether the user has write permissions on the repository
    admin: boolean; // Whether the user has admin permissions on the repository
  };
  media_types: string[]; // An array of supported media types for the repository
  content_types: string[]; // An array of supported content types for the repository
}

export interface DockerComposeService {
  image?: string;
  ports?: string[];
  environment?: { [envVar: string]: string };
  volumes?: string[];
  restart?: string;
  command?: string;
  entrypoint?: string;
  build?: string | { context: string; dockerfile?: string };
  networks?: string[] | { [networkName: string]: { aliases?: string[] } };
  network_mode?: string;
  hostname?: string;
  privileged?: boolean;
  stdin_open?: boolean;
  tty?: boolean;
  depends_on?: string[];
  labels?: { [labelName: string]: string };
}

export interface DockerCompose {
  version?: string;
  services: { [serviceName: string]: DockerComposeService };
  networks?: { [networkName: string]: {} };
  volumes?: { [volumeName: string]: {} };
}

export interface ChangelogEntry {
  version: string;
  date: string;
  isRelease: boolean; // minor/major versions get their full release notes shown
  title: string | null;
  notes: string | null;
}

export interface DockerMeta {
  architectures: string[];
  size: number | null; // compressed bytes
  latestVersion: string | null;
  versions: { name: string; size: number; date: string }[];
}

export interface ProjectStats {
  repo: string;
  url: string;
  stars: number;
  forks: number;
  license: string | null;
  language: string | null;
  updatedAt: string;
  latestRelease: string | null;
  homepage: string | null;
  archived: boolean;
}

export interface SimilarApp {
  title: string;
  slug: string;
  logo?: string;
  category?: string;
}
