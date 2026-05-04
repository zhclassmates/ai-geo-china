export const DEFAULT_ENABLED_PROVIDER_IDS = ['doubao'];

export const PROVIDERS = [
  {
    id: 'doubao',
    name: '豆包',
    url: 'https://www.doubao.com/chat/',
    icon: '/icons/providers/doubao.png',
    iconDark: '/icons/providers/dark/doubao.png',
    enabled: true,
    supportsCitations: 'partial',
    citationStrategy: 'visible_citation_links'
  }
];

export function getProviderById(id) {
  return PROVIDERS.find(p => p.id === id);
}

export async function getProviderByIdWithSettings(id) {
  const provider = PROVIDERS.find(p => p.id === id);
  if (!provider) return null;

  return provider;
}

export async function getEnabledProviders() {
  const settings = await chrome.storage.sync.get({
    enabledProviders: DEFAULT_ENABLED_PROVIDER_IDS
  });

  return PROVIDERS
    .filter(p => settings.enabledProviders.includes(p.id));
}
