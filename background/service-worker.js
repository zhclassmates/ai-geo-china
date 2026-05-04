import { notifyMessage } from '../modules/messaging.js';
import { DEFAULT_ENABLED_PROVIDER_IDS, PROVIDERS } from '../modules/providers.js';
import {
  saveConversation,
  findConversationByConversationId,
  saveGeoRun,
  getDefaultGeoProject
} from '../modules/history-manager.js';
import { t, initializeLanguage } from '../modules/i18n.js';

// T008 & T065: Install event - setup context menus and configure side panel
const DEFAULT_SHORTCUT_SETTING = { keyboardShortcutEnabled: true };
let keyboardShortcutEnabled = true;

// T070: Track side panel state per window
const sidePanelState = new Map(); // windowId -> boolean (true = open, false = closed)

async function loadShortcutSetting() {
  try {
    const result = await chrome.storage.sync.get(DEFAULT_SHORTCUT_SETTING);
    keyboardShortcutEnabled = result.keyboardShortcutEnabled;
  } catch (error) {
    // Fallback to default if storage unavailable
    keyboardShortcutEnabled = true;
  }
}

// T070: Helper to toggle side panel
async function toggleSidePanel(windowId, action = null) {
  if (!windowId) {
    return;
  }

  const isOpen = sidePanelState.get(windowId) || false;

  if (!isOpen) {
    // Open the side panel
    try {
      await chrome.sidePanel.open({ windowId });
      sidePanelState.set(windowId, true);
    } catch (error) {
      // Silently fail - side panel may not be available
    }
  } else {
    // Close the side panel by sending message to sidebar
    try {
      await notifyMessage({ action: 'closeSidePanel', payload: {} });
      sidePanelState.set(windowId, false);
    } catch (error) {
      // Even if message fails, assume it's closed
      sidePanelState.set(windowId, false);
    }
  }
}

async function configureActionBehavior() {
  // Always handle action clicks ourselves so we can respect the toggle state.
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch (error) {
    // Silently fail if API not available
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await createContextMenus();
  await loadShortcutSetting();
  await configureActionBehavior();
});

chrome.runtime.onStartup.addListener(async () => {
  await loadShortcutSetting();
  await configureActionBehavior();
});

// T065-T068: Create/update context menus dynamically based on enabled providers
async function createContextMenus() {
  // Remove all existing menus
  await chrome.contextMenus.removeAll();

  // Initialize language before creating menus
  await initializeLanguage();

  // Get enabled providers from settings
  const settings = await chrome.storage.sync.get({
    enabledProviders: DEFAULT_ENABLED_PROVIDER_IDS
  });

  const enabledProviders = settings.enabledProviders;

  // Create main context menu item
  chrome.contextMenus.create({
    id: 'open-smarter-panel',
    title: t('contextMenuSendTo'),
    contexts: ['page', 'selection', 'link']
  });

  // Create submenu for each enabled provider
  const providerNames = Object.fromEntries(PROVIDERS.map(provider => [provider.id, provider.name]));

  enabledProviders.forEach(providerId => {
    chrome.contextMenus.create({
      id: `provider-${providerId}`,
      parentId: 'open-smarter-panel',
      title: providerNames[providerId] || providerId,
      contexts: ['page', 'selection', 'link']
    });
  });

  // Add Prompt Library option
  chrome.contextMenus.create({
    id: 'open-prompt-library',
    parentId: 'open-smarter-panel',
    title: t('contextMenuPromptLibrary'),
    contexts: ['page', 'selection', 'link']
  });
}

// T066: Listen for settings changes and update context menus
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (changes.enabledProviders || changes.language) {
    createContextMenus();
  }
});

// T009 & T067-T068 & T070: Context menu click handler with state tracking
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (!tab || !tab.windowId) {
      return;
    }

    if (info.menuItemId.startsWith('provider-')) {
      const providerId = info.menuItemId.replace('provider-', '');

      // Open side panel and track state
      await chrome.sidePanel.open({ windowId: tab.windowId });
      sidePanelState.set(tab.windowId, true);

      // Get source URL placement setting
      const settings = await chrome.storage.sync.get({ sourceUrlPlacement: 'end' });
      const placement = settings.sourceUrlPlacement;

      // Check if text is selected
      if (info.selectionText) {
        // Format content with source based on user preference
        let contentToSend;
        if (placement === 'none') {
          contentToSend = info.selectionText;
        } else if (placement === 'beginning') {
          contentToSend = `Source: ${info.pageUrl}\n\n${info.selectionText}`;
        } else {
          // default: 'end'
          contentToSend = `${info.selectionText}\n\nSource: ${info.pageUrl}`;
        }

        // Wait for sidebar to load, then send message to switch provider
        setTimeout(() => {
          notifyMessage({
            action: 'switchProvider',
            payload: { providerId, selectedText: contentToSend }
          }).catch(() => {
            // Sidebar may not be ready yet, silently ignore
          });
        }, 100);
      } else {
        // No text selected - extract page content
        try {
          const response = await chrome.tabs.sendMessage(tab.id, {
            action: 'extractPageContent'
          });

          if (response && response.success) {
            // Send extracted content to sidebar
            setTimeout(() => {
              notifyMessage({
                action: 'switchProvider',
                payload: { providerId, selectedText: response.content }
              }).catch(() => {
                // Sidebar may not be ready yet, silently ignore
              });
            }, 100);
          } else {
            // Extraction failed - send empty to provider
            setTimeout(() => {
              notifyMessage({
                action: 'switchProvider',
                payload: { providerId, selectedText: '' }
              }).catch(() => {});
            }, 100);
          }
        } catch (error) {
          // Content script not ready or extraction failed
          // Send empty to provider
          setTimeout(() => {
            notifyMessage({
              action: 'switchProvider',
              payload: { providerId, selectedText: '' }
            }).catch(() => {});
          }, 100);
        }
      }
    } else if (info.menuItemId === 'open-prompt-library') {
      // Open side panel with prompt library and track state
      await chrome.sidePanel.open({ windowId: tab.windowId });
      sidePanelState.set(tab.windowId, true);

      // Get source URL placement setting
      const settings = await chrome.storage.sync.get({ sourceUrlPlacement: 'end' });
      const placement = settings.sourceUrlPlacement;

      // Check if text is selected
      if (info.selectionText) {
        // Format content with source based on user preference
        let contentToSend;
        if (placement === 'none') {
          contentToSend = info.selectionText;
        } else if (placement === 'beginning') {
          contentToSend = `Source: ${info.pageUrl}\n\n${info.selectionText}`;
        } else {
          // default: 'end'
          contentToSend = `${info.selectionText}\n\nSource: ${info.pageUrl}`;
        }

        // Wait for sidebar to load, then switch to prompt library
        setTimeout(() => {
          notifyMessage({
            action: 'openPromptLibrary',
            payload: { selectedText: contentToSend }
          }).catch(() => {
            // Sidebar may not be ready yet, ignore error
          });
        }, 100);
      } else {
        // No text selected - extract page content
        try {
          const response = await chrome.tabs.sendMessage(tab.id, {
            action: 'extractPageContent'
          });

          if (response && response.success) {
            // Send extracted content to sidebar
            setTimeout(() => {
              notifyMessage({
                action: 'openPromptLibrary',
                payload: { selectedText: response.content }
              }).catch(() => {
                // Sidebar may not be ready yet, ignore error
              });
            }, 100);
          } else {
            // Extraction failed - send empty
            setTimeout(() => {
              notifyMessage({
                action: 'openPromptLibrary',
                payload: { selectedText: '' }
              }).catch(() => {});
            }, 100);
          }
        } catch (error) {
          // Content script not ready or extraction failed
          // Send empty
          setTimeout(() => {
            notifyMessage({
              action: 'openPromptLibrary',
              payload: { selectedText: '' }
            }).catch(() => {});
          }, 100);
        }
      }
    }
  } catch (error) {
    // Silently handle context menu errors
  }
});

// T010 & T070: Handle action clicks (toolbar or `_execute_action` command) with toggle
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.windowId) {
    return;
  }

  if (!keyboardShortcutEnabled) {
    return;
  }

  await toggleSidePanel(tab.windowId);
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'sync') return;

  if (changes.keyboardShortcutEnabled) {
    keyboardShortcutEnabled = changes.keyboardShortcutEnabled.newValue !== false;
  }
});

// T070: Clean up state when windows are closed
chrome.windows.onRemoved.addListener((windowId) => {
  sidePanelState.delete(windowId);
});

// T070: Listen for sidebar close notifications, conversation saves, and duplicate checks
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sidePanelClosed') {
    // Get windowId from sender
    if (sender.tab && sender.tab.windowId) {
      sidePanelState.set(sender.tab.windowId, false);
    }
    sendResponse({ success: true });
  } else if (message.action === 'saveConversationFromPage') {
    // Handle conversation save from provider pages
    handleSaveConversation(message.payload, sender).then(sendResponse);
    return true; // Keep channel open for async response
  } else if (message.action === 'saveGeoRunFromPage') {
    handleSaveGeoRun(message.payload, sender).then(sendResponse);
    return true;
  } else if (message.action === 'analyzeGeoRun') {
    handleAnalyzeGeoRun(message.payload).then(sendResponse);
    return true;
  } else if (message.action === 'fetchCitationPage') {
    handleFetchCitationPage(message.payload).then(sendResponse);
    return true;
  } else if (message.action === 'checkDuplicateConversation') {
    // Handle duplicate check request
    handleCheckDuplicate(message.payload).then(sendResponse);
    return true; // Keep channel open for async response
  } else if (message.action === 'fetchLatestCommit') {
    // T073: Handle version check request from options page
    handleFetchLatestCommit().then(sendResponse);
    return true; // Keep channel open for async response
  }
  return true;
});

// T073: Handle version check by fetching latest commit from GitHub API
async function handleFetchLatestCommit() {
  try {
    const GITHUB_API_URL = 'https://api.github.com/repos/xiaolai/insidebar-ai/commits/main';

    const response = await fetch(GITHUB_API_URL, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      data: {
        sha: data.sha,
        shortSha: data.sha.substring(0, 7),
        date: data.commit.committer.date,
        message: data.commit.message
      }
    };
  } catch (error) {
    console.error('[Background] Error fetching latest commit:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Handle duplicate conversation check - now with direct database access
async function handleCheckDuplicate(payload) {
  try {
    const { conversationId } = payload;

    if (!conversationId) {
      return { isDuplicate: false };
    }

    // Query IndexedDB directly without requiring sidebar
    const existingConversation = await findConversationByConversationId(conversationId);

    if (existingConversation) {
      return {
        isDuplicate: true,
        existingConversation: existingConversation
      };
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error('[Background] Error checking duplicate:', error);
    // Propagate error instead of silently returning false
    throw error;
  }
}

// Handle saving conversation - now with direct database access
async function handleSaveConversation(conversationData, sender) {
  try {
    const payload = {
      ...conversationData,
      tabId: conversationData.tabId || sender?.tab?.id || null,
      rawEvidence: {
        ...(conversationData.rawEvidence || {}),
        tabId: conversationData.rawEvidence?.tabId || sender?.tab?.id || null
      }
    };

    // Save directly to IndexedDB without requiring sidebar
    const savedConversation = await saveConversation(payload);
    let savedGeoRun = null;

    if (payload.type === 'geo_run' || Array.isArray(payload.citations)) {
      const geoRunResponse = await handleSaveGeoRun({
        ...payload,
        conversationId: savedConversation.id
      }, sender);

      if (geoRunResponse.success) {
        savedGeoRun = geoRunResponse.data;
      }
    }

    // Notify sidebar to refresh chat history if it's open
    try {
      await notifyMessage({
        action: 'refreshChatHistory',
        payload: { conversationId: savedConversation.id, geoRunId: savedGeoRun?.id }
      });
      if (savedGeoRun) {
        await notifyMessage({
          action: 'refreshGeoDashboard',
          payload: { geoRunId: savedGeoRun.id }
        });
      }
    } catch (error) {
      // Sidebar may not be open, that's okay
    }

    // Get user setting for auto-opening sidebar
    const settings = await chrome.storage.sync.get({
      autoOpenSidebarOnSave: false
    });

    // Optionally open sidebar and switch to chat history
    if (settings.autoOpenSidebarOnSave && sender.tab) {
      const windowId = sender.tab.windowId;
      const isOpen = sidePanelState.get(windowId) || false;

      if (!isOpen && windowId) {
        try {
          // This will work because it's within the user gesture flow
          await chrome.sidePanel.open({ windowId });
          sidePanelState.set(windowId, true);

          // Wait for sidebar to load, then switch to chat history
          setTimeout(() => {
            notifyMessage({
              action: 'switchToChatHistory',
              payload: { conversationId: savedConversation.id }
            }).catch(() => {
              // Sidebar may not be ready, ignore
            });
          }, 300);
        } catch (error) {
          // If sidebar opening fails, it's okay - the save already succeeded
          console.warn('[Background] Could not open sidebar after save:', error.message);
        }
      }
    }

    return { success: true, data: savedConversation, geoRun: savedGeoRun };
  } catch (error) {
    console.error('[Background] Error saving conversation:', error);
    return { success: false, error: error.message };
  }
}

async function handleSaveGeoRun(payload, sender) {
  try {
    const analysis = await handleAnalyzeGeoRun(payload);
    if (!analysis.success) {
      return analysis;
    }

    const savedRun = await saveGeoRun(analysis.data);
    return { success: true, data: savedRun };
  } catch (error) {
    console.error('[Background] Error saving GEO run:', error);
    return { success: false, error: error.message };
  }
}

async function handleAnalyzeGeoRun(payload) {
  try {
    const project = payload.project || await getDefaultGeoProject();
    const citations = normalizeAndClassifyCitations(payload.citations || [], project);
    const answerText = payload.answerText || payload.answerMarkdown || extractAssistantAnswer(payload.messages) || payload.content || '';
    const query = payload.query || extractLastUserQuery(payload.messages) || payload.title || '';
    const mentions = extractMentions(answerText, project);
    const rankings = extractRankings(mentions);
    const sentiment = calculateOverallSentiment(mentions);
    const scores = calculateGeoScores(citations, mentions);
    const diagnostics = buildDiagnostics({ citations, mentions, scores, project });

    return {
      success: true,
      data: {
        ...payload,
        projectId: project.id || 'default',
        query,
        answerText,
        answerMarkdown: payload.answerMarkdown || answerText,
        citations,
        mentions,
        rankings,
        sentiment,
        scores,
        diagnostics,
        rawEvidence: {
          ...(payload.rawEvidence || {}),
          linkCount: payload.rawEvidence?.linkCount ?? citations.length,
          citationCount: citations.length
        }
      }
    };
  } catch (error) {
    console.error('[Background] Error analyzing GEO run:', error);
    return { success: false, error: error.message };
  }
}

async function handleFetchCitationPage(payload) {
  try {
    const url = payload?.url;
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new Error('A valid citation URL is required');
    }

    const response = await fetch(url, { redirect: 'follow' });
    const text = await response.text();

    return {
      success: true,
      data: {
        url: response.url,
        status: response.status,
        contentType: response.headers.get('content-type') || '',
        text: text.slice(0, 50000)
      }
    };
  } catch (error) {
    console.error('[Background] Error fetching citation page:', error);
    return { success: false, error: error.message };
  }
}

function normalizeAndClassifyCitations(citations, project) {
  const seen = new Set();

  return citations
    .map((citation, index) => normalizeCitation(citation, index, project))
    .filter(Boolean)
    .filter(citation => {
      if (seen.has(citation.url)) return false;
      seen.add(citation.url);
      return true;
    })
    .map((citation, index) => ({ ...citation, position: index + 1 }));
}

function normalizeCitation(citation, index, project) {
  if (!citation || !citation.url) return null;

  let url;
  try {
    url = new URL(citation.url);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(param => {
      url.searchParams.delete(param);
    });
    url.hash = '';
  } catch (error) {
    return null;
  }

  const domain = url.hostname.replace(/^www\./, '').toLowerCase();
  const targetDomains = Array.isArray(project.domains) ? project.domains : [];
  const competitors = Array.isArray(project.competitors) ? project.competitors : [];
  const isTargetDomain = targetDomains.some(targetDomain => domainMatches(domain, targetDomain));
  const isCompetitorDomain = competitors.some(competitor => {
    const domains = Array.isArray(competitor.domains) ? competitor.domains : [];
    return domains.some(competitorDomain => domainMatches(domain, competitorDomain));
  });

  return {
    url: url.href,
    domain,
    title: sanitizeText(citation.title || domain, 160),
    anchorText: sanitizeText(citation.anchorText || citation.title || domain, 240),
    sourceName: sanitizeText(citation.sourceName || '', 120),
    snippet: sanitizeText(citation.snippet || '', 500),
    position: citation.position || index + 1,
    visibleRank: citation.visibleRank || citation.position || index + 1,
    originalDocRank: citation.originalDocRank ?? '',
    publishTime: citation.publishTime || '',
    docId: citation.docId || '',
    searchId: citation.searchId || '',
    sourcePanel: citation.sourcePanel || '',
    extractionMethod: citation.extractionMethod || '',
    sourceType: citation.sourceType || classifySourceType(domain, citation.title, citation.anchorText),
    sourceRole: isTargetDomain ? 'target' : isCompetitorDomain ? 'competitor' : 'third_party',
    isTargetDomain,
    isCompetitorDomain
  };
}

function domainMatches(domain, candidate) {
  const normalized = String(candidate || '').replace(/^www\./, '').toLowerCase();
  return normalized && (domain === normalized || domain.endsWith(`.${normalized}`));
}

function classifySourceType(domain, title = '', text = '') {
  const haystack = `${domain} ${title} ${text}`.toLowerCase();

  if (/\.(edu|ac\.[a-z]{2})$/.test(domain) || haystack.includes('university') || haystack.includes('大学')) return 'university';
  if (/\.(gov|gov\.[a-z]{2})$/.test(domain) || haystack.includes('government') || haystack.includes('政府')) return 'government';
  if (/(reddit|quora|zhihu|stackexchange|forum|bbs|community)/.test(haystack)) return 'forum';
  if (/(amazon|shopify|etsy|ebay|taobao|tmall|jd\.com|marketplace)/.test(haystack)) return 'marketplace';
  if (/(review|reviews|best-|top-|compare|comparison|评测|测评|排行|榜单|对比)/.test(haystack)) return 'review';
  if (/(news|media|press|magazine|journal|blog|times|post|资讯|新闻|媒体)/.test(haystack)) return 'media';
  return 'official';
}

function extractAssistantAnswer(messages = []) {
  return messages
    .filter(message => message.role === 'assistant')
    .map(message => message.content)
    .filter(Boolean)
    .join('\n\n');
}

function extractLastUserQuery(messages = []) {
  return [...messages].reverse().find(message => message.role === 'user')?.content || '';
}

function extractMentions(answerText, project = {}) {
  const entities = [];

  if (project.brandName) {
    entities.push({ entity: project.brandName, type: 'target_brand', aliases: [project.brandName] });
  }

  (project.products || []).forEach(product => {
    entities.push({
      entity: product.name,
      type: 'target_product',
      aliases: [product.name, ...(product.aliases || [])]
    });
  });

  (project.competitors || []).forEach(competitor => {
    entities.push({
      entity: competitor.name || competitor.domains?.[0],
      type: 'competitor',
      aliases: [competitor.name, ...(competitor.aliases || []), ...(competitor.domains || [])].filter(Boolean)
    });
  });

  return entities
    .map(entity => buildMention(answerText, entity))
    .filter(Boolean)
    .sort((a, b) => a.firstPosition - b.firstPosition);
}

function buildMention(answerText, entity) {
  if (!answerText || !entity.entity) return null;

  const aliases = [...new Set((entity.aliases || []).filter(Boolean))];
  const matches = [];

  aliases.forEach(alias => {
    const regex = new RegExp(escapeRegExp(alias), 'gi');
    let match;
    while ((match = regex.exec(answerText)) !== null) {
      matches.push({ index: match.index, alias });
      if (match.index === regex.lastIndex) regex.lastIndex += 1;
    }
  });

  if (matches.length === 0) return null;

  matches.sort((a, b) => a.index - b.index);
  const firstPosition = matches[0].index;

  return {
    entity: entity.entity,
    type: entity.type,
    count: matches.length,
    firstPosition,
    listRank: findListRank(answerText, aliases),
    sentiment: inferSentiment(answerText, firstPosition),
    context: answerText.slice(Math.max(0, firstPosition - 80), firstPosition + 180).replace(/\s+/g, ' ').trim()
  };
}

function findListRank(answerText, aliases) {
  const lines = answerText.split(/\n+/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const rankMatch = line.match(/^\s*(?:#{1,6}\s*)?(?:\d+[\.)、]|[-*]\s+)\s*(.+)$/);
    if (!rankMatch) continue;

    const hasAlias = aliases.some(alias => alias && line.toLowerCase().includes(alias.toLowerCase()));
    if (!hasAlias) continue;

    const explicitRank = line.match(/^\s*(?:#{1,6}\s*)?(\d+)[\.)、]/);
    if (explicitRank) return Number(explicitRank[1]);

    return lines.slice(0, i + 1).filter(candidate => /^\s*(?:#{1,6}\s*)?(?:\d+[\.)、]|[-*]\s+)/.test(candidate)).length;
  }

  return null;
}

function extractRankings(mentions) {
  return mentions
    .filter(mention => mention.listRank !== null)
    .map(mention => ({
      entity: mention.entity,
      type: mention.type,
      listRank: mention.listRank,
      firstPosition: mention.firstPosition
    }));
}

function inferSentiment(answerText, index) {
  const context = answerText.slice(Math.max(0, index - 120), index + 220).toLowerCase();
  const positive = ['best', 'recommended', 'top', 'strong', 'trusted', '首选', '推荐', '靠谱', '优秀', '性价比', '适合', 'tốt', 'uy tín'];
  const negative = ['avoid', 'weak', 'expensive', 'limited', 'complaint', '不推荐', '较弱', '不足', '昂贵', '投诉', 'hạn chế', 'không nên'];
  const positiveScore = positive.filter(word => context.includes(word)).length;
  const negativeScore = negative.filter(word => context.includes(word)).length;

  if (positiveScore > negativeScore) return 'positive';
  if (negativeScore > positiveScore) return 'negative';
  return 'neutral';
}

function calculateOverallSentiment(mentions) {
  const targetMentions = mentions.filter(mention => mention.type.startsWith('target'));
  if (targetMentions.some(mention => mention.sentiment === 'positive')) return 'positive';
  if (targetMentions.some(mention => mention.sentiment === 'negative')) return 'negative';
  return 'neutral';
}

function calculateGeoScores(citations, mentions) {
  const targetMentions = mentions.filter(mention => mention.type.startsWith('target'));
  const competitorMentions = mentions.filter(mention => mention.type === 'competitor');
  const targetMentionCount = targetMentions.reduce((sum, mention) => sum + mention.count, 0);
  const competitorMentionCount = competitorMentions.reduce((sum, mention) => sum + mention.count, 0);
  const totalMentions = targetMentionCount + competitorMentionCount;

  return {
    targetMentioned: targetMentionCount > 0,
    targetCited: citations.some(citation => citation.sourceRole === 'target'),
    competitorMentioned: competitorMentionCount > 0,
    competitorCited: citations.some(citation => citation.sourceRole === 'competitor'),
    targetRank: targetMentions.map(mention => mention.listRank).filter(Boolean).sort((a, b) => a - b)[0] || null,
    mentionRate: targetMentionCount > 0 ? 1 : 0,
    citationRate: citations.some(citation => citation.sourceRole === 'target') ? 1 : 0,
    shareOfVoice: totalMentions > 0 ? targetMentionCount / totalMentions : 0
  };
}

function buildDiagnostics({ citations, mentions, scores, project }) {
  const diagnostics = [];
  const thirdPartyCitations = citations.filter(citation => citation.sourceRole === 'third_party');
  const competitorMentions = mentions.filter(mention => mention.type === 'competitor');

  if (!scores.targetMentioned) {
    diagnostics.push({
      type: 'retrieval_gap',
      severity: 'high',
      message: 'Target brand/product was not mentioned in the AI answer.',
      evidence: competitorMentions.length > 0 ? 'Competitors appeared while the target did not.' : 'No configured target entity appeared in the answer.'
    });
  }

  if (scores.targetMentioned && !scores.targetCited) {
    diagnostics.push({
      type: 'citation_gap',
      severity: 'medium',
      message: 'Target entity was mentioned, but target domains were not cited.',
      evidence: 'The answer may know the entity from third-party pages rather than the official site.'
    });
  }

  if (scores.competitorCited || competitorMentions.length > 0) {
    diagnostics.push({
      type: 'competitor_gap',
      severity: 'medium',
      message: 'Competitors received answer visibility or citations.',
      evidence: competitorMentions.map(mention => `${mention.entity}${mention.listRank ? ` rank ${mention.listRank}` : ''}`).join(', ')
    });
  }

  if (thirdPartyCitations.length > 0 && !scores.targetCited) {
    diagnostics.push({
      type: 'source_gap',
      severity: 'medium',
      message: 'The AI answer relied on third-party sources instead of target domains.',
      evidence: thirdPartyCitations.slice(0, 5).map(citation => citation.domain).join(', ')
    });
  }

  if ((project.markets || []).length > 1 && !scores.targetMentioned) {
    diagnostics.push({
      type: 'language_gap',
      severity: 'low',
      message: 'Multi-language markets are configured, but this answer did not surface the target.',
      evidence: `Configured markets: ${(project.markets || []).join(', ')}`
    });
  }

  return diagnostics;
}

function sanitizeText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// T069 & T070: Listen for keyboard shortcuts with toggle support
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab || !tab.windowId) {
    return;
  }

  const windowId = tab.windowId;
  const isOpen = sidePanelState.get(windowId) || false;

  if (command === 'open-prompt-library') {
    if (!isOpen) {
      // Open and switch to Prompt Library
      try {
        await chrome.sidePanel.open({ windowId });
        sidePanelState.set(windowId, true);

        // Wait for sidebar to load, then switch to Prompt Library
        setTimeout(() => {
          notifyMessage({
            action: 'openPromptLibrary',
            payload: {}
          }).catch(() => {
            // Sidebar may not be ready yet, ignore error
          });
        }, 100);
      } catch (error) {
        // Silently handle errors
      }
    } else {
      // Close side panel (toggle off)
      try {
        await notifyMessage({ action: 'closeSidePanel', payload: {} });
        sidePanelState.set(windowId, false);
      } catch (error) {
        // Even if message fails, assume it's closed
        sidePanelState.set(windowId, false);
      }
    }
  } else if (command === 'toggle-focus') {
    // Toggle focus between sidebar and main page
    if (!isOpen) {
      // Sidebar not open - open it (it will auto-focus)
      try {
        await chrome.sidePanel.open({ windowId });
        sidePanelState.set(windowId, true);
      } catch (error) {
        // Silently handle errors
      }
    } else {
      // Sidebar is open - toggle focus between sidebar and page
      try {
        // Check if sidebar has focus
        const sidebarResponse = await notifyMessage({
          action: 'checkFocus',
          payload: {}
        });

        if (sidebarResponse && sidebarResponse.hasFocus) {
          // Sidebar has focus - switch to page input
          if (tab && tab.id) {
            try {
              await chrome.tabs.sendMessage(tab.id, { action: 'takeFocus' });
            } catch (error) {
              // Content script may not be available
            }
          }
        } else {
          // Page has focus (or unknown) - switch to sidebar
          await notifyMessage({
            action: 'takeFocus',
            payload: {}
          });
        }
      } catch (error) {
        // If sidebar messaging fails, try to focus sidebar anyway
        try {
          await notifyMessage({
            action: 'takeFocus',
            payload: {}
          });
        } catch (e) {
          // Silently handle errors
        }
      }
    }
  }
});
