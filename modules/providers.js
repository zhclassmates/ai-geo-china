export const PROVIDERS = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    icon: '/icons/providers/chatgpt.png',
    iconDark: '/icons/providers/dark/chatgpt.png',
    enabled: true,
    supportsCitations: true,
    citationStrategy: 'chatgpt_sources_panel'
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    icon: '/icons/providers/perplexity.png',
    iconDark: '/icons/providers/dark/perplexity.png',
    enabled: true,
    supportsCitations: true,
    citationStrategy: 'visible_citation_links'
  },
  {
    id: 'claude',
    name: 'Claude',
    url: 'https://claude.ai',
    icon: '/icons/providers/claude.png',
    iconDark: '/icons/providers/dark/claude.png',
    enabled: true,
    supportsCitations: false,
    citationStrategy: 'none'
  },
  {
    id: 'gemini',
    name: 'Gemini',
    url: 'https://gemini.google.com',
    icon: '/icons/providers/gemini.png',
    iconDark: '/icons/providers/dark/gemini.png',
    enabled: true,
    supportsCitations: 'partial',
    citationStrategy: 'links_and_grounding_cards'
  },
  {
    id: 'google',
    name: 'Google AI Mode',
    url: 'https://www.google.com/search?udm=50',
    icon: '/icons/providers/google.png',
    iconDark: '/icons/providers/dark/google.png',
    enabled: true,
    supportsCitations: true,
    citationStrategy: 'ai_mode_source_cards'
  },
  {
    id: 'grok',
    name: 'Grok',
    url: 'https://grok.com',
    icon: '/icons/providers/grok.png',
    iconDark: '/icons/providers/dark/grok.png',
    enabled: true,
    supportsCitations: false,
    citationStrategy: 'none'
  },
  {
    id: 'copilot',
    name: 'Microsoft Copilot',
    url: 'https://copilot.microsoft.com',
    icon: '/icons/providers/copilot.png',
    iconDark: '/icons/providers/dark/copilot.png',
    enabled: true,
    supportsCitations: 'partial',
    citationStrategy: 'visible_citation_links'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    icon: '/icons/providers/deepseek.png',
    iconDark: '/icons/providers/dark/deepseek.png',
    enabled: true,
    supportsCitations: false,
    citationStrategy: 'none'
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
    enabledProviders: ['chatgpt', 'perplexity', 'claude', 'gemini', 'google', 'grok', 'copilot', 'deepseek']
  });

  return PROVIDERS
    .filter(p => settings.enabledProviders.includes(p.id));
}
