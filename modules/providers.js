export const DEFAULT_ENABLED_PROVIDER_IDS = [
  'kimi',
  'qianwen',
  'wenxin',
  'zhipu',
  'doubao',
  'yuanbao',
  'xinghuo',
  'metaso',
  'nami',
  'tiangong'
];

export const PROVIDERS = [
  {
    id: 'kimi',
    name: 'Kimi',
    url: 'https://www.kimi.com/',
    icon: '/icons/providers/kimi.png',
    iconDark: '/icons/providers/dark/kimi.png',
    enabled: true,
    supportsCitations: 'partial',
    citationStrategy: 'visible_citation_links'
  },
  {
    id: 'qianwen',
    name: '千问',
    url: 'https://www.qianwen.com/chat',
    icon: '/icons/providers/qianwen.png',
    iconDark: '/icons/providers/dark/qianwen.png',
    enabled: true,
    supportsCitations: 'partial',
    citationStrategy: 'visible_citation_links'
  },
  {
    id: 'wenxin',
    name: '文心一言',
    url: 'https://yiyan.baidu.com/',
    icon: '/icons/providers/wenxin.png',
    iconDark: '/icons/providers/dark/wenxin.png',
    enabled: true,
    supportsCitations: 'partial',
    citationStrategy: 'visible_citation_links'
  },
  {
    id: 'zhipu',
    name: '智谱清言',
    url: 'https://chatglm.cn/',
    icon: '/icons/providers/zhipu.png',
    iconDark: '/icons/providers/dark/zhipu.png',
    enabled: true,
    supportsCitations: 'partial',
    citationStrategy: 'visible_citation_links'
  },
  {
    id: 'doubao',
    name: '豆包',
    url: 'https://www.doubao.com/chat/',
    icon: '/icons/providers/doubao.png',
    iconDark: '/icons/providers/dark/doubao.png',
    enabled: true,
    supportsCitations: 'partial',
    citationStrategy: 'visible_citation_links'
  },
  {
    id: 'yuanbao',
    name: '腾讯元宝',
    url: 'https://yuanbao.tencent.com/chat/',
    icon: '/icons/providers/yuanbao.png',
    iconDark: '/icons/providers/dark/yuanbao.png',
    enabled: true,
    supportsCitations: 'partial',
    citationStrategy: 'visible_citation_links'
  },
  {
    id: 'xinghuo',
    name: '讯飞星火',
    url: 'https://xinghuo.xfyun.cn/',
    icon: '/icons/providers/xinghuo.png',
    iconDark: '/icons/providers/dark/xinghuo.png',
    enabled: true,
    supportsCitations: 'partial',
    citationStrategy: 'visible_citation_links'
  },
  {
    id: 'metaso',
    name: '秘塔 AI 搜索',
    url: 'https://metaso.cn/',
    icon: '/icons/providers/metaso.png',
    iconDark: '/icons/providers/dark/metaso.png',
    enabled: true,
    supportsCitations: true,
    citationStrategy: 'visible_citation_links'
  },
  {
    id: 'nami',
    name: '纳米 AI',
    url: 'https://www.n.cn/',
    icon: '/icons/providers/nami.png',
    iconDark: '/icons/providers/dark/nami.png',
    enabled: true,
    supportsCitations: 'partial',
    citationStrategy: 'visible_citation_links'
  },
  {
    id: 'tiangong',
    name: '天工 AI',
    url: 'https://www.tiangong.cn/',
    icon: '/icons/providers/tiangong.png',
    iconDark: '/icons/providers/dark/tiangong.png',
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
