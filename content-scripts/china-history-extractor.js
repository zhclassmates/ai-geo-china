// Doubao Conversation Extractor
// Extracts the visible answer and citation links from Doubao.
//
// IMPORTANT: Requires conversation-extractor-utils.js and language-detector.js.

(function() {
  'use strict';

  let extractMarkdownFromElement;
  let extractExternalLinks;
  let extractCitationCards;
  let dedupeCitations;
  let formatMessagesAsText;
  let generateConversationId;
  let checkForDuplicate;
  let showNotification;
  let setupKeyboardShortcut;
  let normalizeCitationUrl;
  let classifySourceType;

  const PROVIDERS = {
    'www.doubao.com': { id: 'doubao', name: '豆包' }
  };

  const MESSAGE_SELECTORS = [
    '[data-testid*="message"]',
    '[data-testid*="answer"]',
    '[class*="message"]',
    '[class*="answer"]',
    '[class*="markdown"]',
    '[class*="response"]',
    '[class*="chat"] article',
    'article',
    'main section',
    'main [role="article"]'
  ];

  let saveButton = null;
  let observer = null;
  let keyboardShortcutReady = false;
  let initAttempts = 0;
  const MAX_INIT_ATTEMPTS = 20;
  const doubaoNetworkResponses = [];
  let currentDoubaoRun = loadRememberedDoubaoRun();

  window.addEventListener('message', event => {
    if (event.source !== window) return;

    const message = event.data;
    if (message?.source === 'AI_GEO_RUN_BINDING' && message.type === 'doubao_run_started') {
      const run = normalizeDoubaoRunContext(message.payload);
      if (run) {
        currentDoubaoRun = run;
        pruneDoubaoNetworkResponses(run.startedAt);
      }
      return;
    }

    if (message?.source !== 'AI_GEO_DOUBAO_NETWORK_HOOK') return;

    if (message.type === 'hook_ready') {
      console.log('[AI GEO] Doubao network hook ready:', message.payload);
      return;
    }

    if (message.type === 'doubao_response_text' && message.payload?.text) {
      const payload = {
        ...message.payload,
        runId: message.payload.runId || currentDoubaoRun?.runId || '',
        promptHash: message.payload.promptHash || currentDoubaoRun?.promptHash || '',
        runStartedAt: message.payload.runStartedAt || currentDoubaoRun?.startedAt || null,
        provider: message.payload.provider || 'doubao'
      };
      doubaoNetworkResponses.push(payload);

      if (doubaoNetworkResponses.length > 50) {
        doubaoNetworkResponses.shift();
      }

      console.log(
        '[AI GEO] Captured Doubao response:',
        payload.url,
        payload.text?.length,
        payload.runId || 'unbound'
      );
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhenReady);
  } else {
    initWhenReady();
  }

  function getProvider() {
    return PROVIDERS[window.location.hostname] || null;
  }

  function loadExtractorUtils() {
    const utils = window.ConversationExtractorUtils;
    if (!utils) return false;

    extractMarkdownFromElement = utils.extractMarkdownFromElement;
    extractExternalLinks = utils.extractExternalLinks;
    extractCitationCards = utils.extractCitationCards;
    dedupeCitations = utils.dedupeCitations;
    formatMessagesAsText = utils.formatMessagesAsText;
    generateConversationId = utils.generateConversationId;
    checkForDuplicate = utils.checkForDuplicate;
    showNotification = utils.showNotification;
    setupKeyboardShortcut = utils.setupKeyboardShortcut;
    normalizeCitationUrl = utils.normalizeCitationUrl;
    classifySourceType = utils.classifySourceType;

    return [
      extractMarkdownFromElement,
      extractExternalLinks,
      extractCitationCards,
      dedupeCitations,
      formatMessagesAsText,
      generateConversationId,
      checkForDuplicate,
      showNotification,
      setupKeyboardShortcut,
      normalizeCitationUrl,
      classifySourceType
    ].every(fn => typeof fn === 'function');
  }

  function initWhenReady() {
    if (!loadExtractorUtils()) {
      initAttempts += 1;

      if (initAttempts <= MAX_INIT_ATTEMPTS) {
        setTimeout(initWhenReady, 250);
      } else {
        console.error('[Doubao Extractor] Conversation extractor utilities did not load');
      }

      return;
    }

    init();
  }

  function init() {
    const provider = getProvider();
    if (!provider || window !== window.top) return;

    setTimeout(() => {
      insertSaveButton(provider);
      observeForChanges(provider);
    }, 1200);

    if (!keyboardShortcutReady) {
      setupKeyboardShortcut(() => handleSaveClick(), () => Boolean(getProvider()));
      keyboardShortcutReady = true;
    }
  }

  function createSaveButton(provider) {
    const button = document.createElement('button');
    button.id = 'insidebar-china-save-conversation';
    button.type = 'button';
    button.title = `保存${provider.name}回答和参考资料`;
    button.setAttribute('aria-label', `保存${provider.name}回答和参考资料`);
    button.innerHTML = `
      <span class="insidebar-china-save-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="insidebar-china-save-label">保存豆包回答</span>
    `;
    button.addEventListener('click', handleSaveClick);
    return button;
  }

  function insertSaveButton(provider) {
    if (document.getElementById('insidebar-china-save-conversation')) return;
    if (!document.body) return;

    saveButton = createSaveButton(provider);
    document.body.appendChild(saveButton);
  }

  function observeForChanges(provider) {
    if (observer || !document.body) return;

    observer = new MutationObserver(() => {
      if (!document.getElementById('insidebar-china-save-conversation')) {
        insertSaveButton(provider);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function getConversationTitle(provider) {
    const title = document.querySelector('title')?.textContent?.trim();
    if (title && title.length > 0) {
      return `${provider.name} - ${title.slice(0, 120)}`;
    }
    return `${provider.name} Conversation`;
  }

  function isVisibleElement(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0;
  }

  function getRememberedProduct() {
    const raw = [
      window.__insidebarLastProduct,
      safeStorageGet(sessionStorage, 'insidebarLastProduct'),
      safeStorageGet(localStorage, 'insidebarLastProduct')
    ].find(Boolean);

    if (!raw) return '';

    try {
      const parsed = JSON.parse(raw);
      if (parsed.provider !== 'doubao') return '';
      if (Date.now() - Number(parsed.timestamp || 0) > 24 * 60 * 60 * 1000) return '';
      return typeof parsed.product === 'string' ? parsed.product.trim() : '';
    } catch (error) {
      return '';
    }
  }

  function safeStorageGet(storage, key) {
    try {
      return storage.getItem(key);
    } catch (error) {
      return '';
    }
  }

  function loadRememberedDoubaoRun() {
    const candidates = [
      window.__insidebarActiveDoubaoRun,
      safeStorageGet(sessionStorage, 'insidebarActiveDoubaoRun'),
      safeStorageGet(localStorage, 'insidebarActiveDoubaoRun')
    ].filter(Boolean);

    for (const candidate of candidates) {
      const parsed = typeof candidate === 'string' ? safeJsonParse(candidate) : candidate;
      const run = normalizeDoubaoRunContext(parsed);
      if (run) return run;
    }

    return null;
  }

  function normalizeDoubaoRunContext(run) {
    if (!run || run.provider !== 'doubao' || !run.runId) return null;

    const startedAt = Number(run.startedAt || 0);
    if (!startedAt || Date.now() - startedAt > 2 * 60 * 60 * 1000) return null;

    return {
      runId: String(run.runId),
      provider: 'doubao',
      prompt: String(run.prompt || ''),
      promptHash: String(run.promptHash || ''),
      startedAt,
      conversationUrl: String(run.conversationUrl || run.url || window.location.href),
      status: run.status || 'running'
    };
  }

  function pruneDoubaoNetworkResponses(startedAt) {
    for (let index = doubaoNetworkResponses.length - 1; index >= 0; index -= 1) {
      if (Number(doubaoNetworkResponses[index]?.capturedAt || 0) < startedAt) {
        doubaoNetworkResponses.splice(index, 1);
      }
    }
  }

  function getRunContextForQuery(query) {
    const run = currentDoubaoRun || loadRememberedDoubaoRun();
    if (!run) return null;

    const queryHash = hashPrompt(query || '');
    const runPrompt = normalizePromptText(run.prompt);
    const queryText = normalizePromptText(query || '');
    const samePrompt = !queryText ||
      run.promptHash === queryHash ||
      runPrompt === queryText ||
      runPrompt.includes(queryText) ||
      queryText.includes(runPrompt);

    return samePrompt ? run : null;
  }

  function hashPrompt(value) {
    const text = normalizePromptText(value);
    let hash = 2166136261;

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function normalizePromptText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function filterDoubaoNetworkResponsesForRun(runContext, finishedAt = Date.now()) {
    if (!runContext) return [];

    const start = Number(runContext.startedAt || 0);
    const end = Number(finishedAt || Date.now()) + 10000;

    return doubaoNetworkResponses.filter(response => {
      const capturedAt = Number(response?.capturedAt || 0);
      if (!capturedAt || capturedAt < start || capturedAt > end) return false;
      if (response.provider && response.provider !== 'doubao') return false;
      if (response.runId && response.runId !== runContext.runId) return false;
      if (response.promptHash && runContext.promptHash && response.promptHash !== runContext.promptHash) return false;
      return true;
    });
  }

  function extractProduct() {
    const remembered = getRememberedProduct();
    if (remembered) return remembered;

    const candidates = Array.from(document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"], [role="textbox"]'))
      .filter(isVisibleElement)
      .filter(element => !element.closest('[data-testid*="message"], [data-testid*="answer"], article, [class*="message"], [class*="answer"], [class*="markdown"], [class*="response"]'))
      .map(element => ({
        element,
        text: (element.value || element.textContent || '').trim()
      }))
      .filter(item => item.text.length > 0 && item.text.length <= 500)
      .sort((a, b) => getInputPriority(a.element) - getInputPriority(b.element))
      .map(item => item.text)
      .filter(text => text.length > 0);

    return candidates[candidates.length - 1] || '';
  }

  function getInputPriority(element) {
    const tag = element.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return 3;
    if (element.getAttribute?.('role') === 'textbox') return 2;
    if (element.getAttribute?.('contenteditable') === 'true') return 1;
    return 0;
  }

  function extractAnswerRoot() {
    const roots = Array.from(document.querySelectorAll(MESSAGE_SELECTORS.join(',')))
      .filter(element => !element.closest('#insidebar-china-save-conversation'))
      .filter(isVisibleElement)
      .filter(element => {
        const text = element.innerText || element.textContent || '';
        return text.trim().length >= 20;
      });

    if (roots.length > 0) {
      return roots[roots.length - 1];
    }

    return document.querySelector('main') || document.body;
  }

  function findDoubaoReferencePanel() {
    const candidates = Array.from(document.querySelectorAll('aside, section, div[role="dialog"], div'));

    return candidates
      .filter(isVisibleElement)
      .find(element => {
        const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300);
        const linkCount = element.querySelectorAll('a[href]').length;

        return /参考资料|引用来源|资料来源|来源/.test(text) && linkCount > 0;
      }) || null;
  }

  function extractSnippetFromCitationElement(anchor) {
    if (!anchor) return '';

    const card = anchor.closest('article, li, section, [role="article"], [class*="card"], [class*="source"], [class*="reference"], div');
    const text = (card?.innerText || card?.textContent || anchor.innerText || anchor.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();

    return text.slice(0, 260);
  }

  function extractDoubaoReferencePanelCitations() {
    const panel = findDoubaoReferencePanel();
    if (!panel) return [];

    const panelLinks = extractExternalLinks(panel);
    const anchors = Array.from(panel.querySelectorAll('a[href]'));

    return panelLinks.map((item, index) => {
      const anchor = anchors.find(candidate => {
        const href = candidate.href || candidate.getAttribute('href') || '';
        return href && (href === item.url || href.includes(item.domain) || item.url.includes(href));
      }) || anchors[index];

      return {
        ...item,
        position: index + 1,
        visibleRank: index + 1,
        visibleWeight: Number((1 / (index + 1)).toFixed(4)),
        sourcePanel: 'doubao_reference_panel',
        snippet: extractSnippetFromCitationElement(anchor)
      };
    });
  }

  function extractVisibleReferenceItems() {
    const panels = findDoubaoReferencePanels();
    const items = [];

    panels.forEach(panel => {
      const candidates = Array.from(panel.querySelectorAll('a, article, li, section, [role="article"], div'))
        .filter(element => element !== panel)
        .filter(isVisibleElement)
        .map(element => ({
          element,
          text: (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim(),
          rect: element.getBoundingClientRect()
        }))
        .filter(item => item.text.length >= 18 && item.text.length <= 700)
        .filter(item => item.rect.width >= 180 && item.rect.height >= 34)
        .filter(item => /今日头条|新浪|抖音|小红书|百度|知乎|搜狐|腾讯|网易|携程|大众点评|美团|参考资料|来源|火锅|推荐|榜单|测评/.test(item.text));

      candidates.forEach(item => {
        const text = stripReferenceNoise(item.text);
        if (!text || text.length < 18) return;
        if (items.some(existing => textIncludesSimilar(existing.snippet, text))) return;

        const url = normalizeDoubaoUrl(item.element.href || item.element.getAttribute?.('href') || '');
        const usableUrl = isUsableExternalCitationUrl(url) && !isLikelyAssetUrl(url) && !isLikelyInternalServiceUrl(url) ? url : '';
        const sourceName = extractReferenceSourceName(text);
        const title = extractReferenceTitle(text, sourceName);

        items.push({
          url: usableUrl,
          domain: usableUrl ? getDomain(usableUrl) : sourceName,
          title: title || sourceName || text.slice(0, 120),
          anchorText: title || text.slice(0, 180),
          snippet: text.slice(0, 500),
          position: items.length + 1,
          visibleRank: items.length + 1,
          sourceType: usableUrl ? classifySourceType(usableUrl, title || sourceName || '', text) : 'unknown',
          sourceRole: 'third_party',
          isTargetDomain: false,
          isCompetitorDomain: false,
          sourcePanel: 'doubao_visible_reference_item',
          extractionMethod: usableUrl ? 'reference_item_link' : 'reference_item_text'
        });
      });
    });

    return items.slice(0, 24);
  }

  function findDoubaoReferencePanels() {
    const candidates = Array.from(document.querySelectorAll('aside, section, div[role="dialog"], div'))
      .filter(isVisibleElement)
      .filter(element => {
        const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
        return /参考资料|引用来源|资料来源|来源/.test(text);
      });

    return candidates
      .filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width >= 240 && rect.height >= 160;
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return (bRect.width * bRect.height) - (aRect.width * aRect.height);
      })
      .slice(0, 3);
  }

  function stripReferenceNoise(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/^\d+\s*/, '')
      .replace(/参考资料|引用来源|资料来源/g, '')
      .trim();
  }

  function textIncludesSimilar(existing, next) {
    if (!existing || !next) return false;
    const a = existing.replace(/\s+/g, '');
    const b = next.replace(/\s+/g, '');
    return a.includes(b) || b.includes(a);
  }

  function extractReferenceSourceName(text) {
    const known = text.match(/今日头条|新浪|抖音|小红书|百度|知乎|搜狐|腾讯|网易|携程|大众点评|美团|头条|微博/);
    if (known) return known[0];
    const sourceMatch = text.match(/[来源：:\s]+([\u4e00-\u9fa5A-Za-z0-9._-]{2,20})/);
    return sourceMatch?.[1] || '';
  }

  function extractReferenceTitle(text, sourceName) {
    const withoutSource = sourceName ? text.replace(sourceName, ' ') : text;
    return withoutSource
      .replace(/\s+/g, ' ')
      .replace(/[①②③④⑤⑥⑦⑧⑨⑩]|\b\d{1,2}\b/g, ' ')
      .trim()
      .slice(0, 180);
  }

  function extractPageWideCitations(answerRoot) {
    const visibleReferenceItems = extractVisibleReferenceItems();
    const citations = [
      ...extractVisibleAnchorCitations(answerRoot),
      ...extractAttributeUrlCitations(answerRoot),
      ...(visibleReferenceItems.length > 0 ? [] : extractRawDocumentUrlCitations())
    ];

    return dedupeCitations(citations)
      .filter(citation => citation.url)
      .filter(citation => !isLikelyAssetUrl(citation.url))
      .filter(citation => !isLikelyInternalServiceUrl(citation.url))
      .slice(0, 120)
      .map((citation, index) => ({
        ...citation,
        position: citation.position || index + 1,
        visibleRank: citation.visibleRank || index + 1
      }));
  }

  function extractVisibleAnchorCitations(answerRoot) {
    const anchors = Array.from(document.querySelectorAll('a[href]'))
      .filter(anchor => !anchor.closest('#insidebar-china-save-conversation'));

    return anchors.map((anchor, index) => {
      const rawUrl = anchor.href || anchor.getAttribute('href') || '';
      const url = normalizeDoubaoUrl(rawUrl);
      if (!isUsableExternalCitationUrl(url)) return null;

      const textParts = getCitationTextParts(anchor);
      const title = pickCitationTitle(textParts, url);

      return {
        url,
        domain: getDomain(url),
        title,
        anchorText: textParts.anchorText || title,
        snippet: buildCitationSnippet(anchor),
        position: index + 1,
        sourceType: classifySourceType(url, title, textParts.fullText || ''),
        sourceRole: 'third_party',
        isTargetDomain: false,
        isCompetitorDomain: false,
        sourcePanel: anchor.closest('aside, [role="dialog"]') ? 'doubao_reference_panel' : 'doubao_page_links',
        extractionMethod: answerRoot?.contains(anchor) ? 'answer_anchor' : 'page_anchor'
      };
    }).filter(Boolean);
  }

  function extractAttributeUrlCitations(answerRoot) {
    const attributeNames = [
      'data-url',
      'data-href',
      'data-link',
      'data-link-url',
      'data-source-url',
      'data-target',
      'data-jump-url',
      'data-schema',
      'data-log-extra',
      'aria-label',
      'title'
    ];
    const selector = attributeNames.map(name => `[${name}]`).join(',');
    const elements = Array.from(document.querySelectorAll(selector))
      .filter(element => !element.closest('#insidebar-china-save-conversation'))
      .slice(0, 2500);
    const results = [];

    elements.forEach((element, elementIndex) => {
      attributeNames.forEach(attributeName => {
        const rawValue = element.getAttribute(attributeName);
        if (!rawValue || !/https?:|%3A%2F%2F/i.test(rawValue)) return;

        extractUrlsFromText(rawValue).forEach(rawUrl => {
          const url = normalizeDoubaoUrl(rawUrl);
          if (!isUsableExternalCitationUrl(url) || isLikelyAssetUrl(url)) return;

          const textParts = getCitationTextParts(element);
          const title = pickCitationTitle(textParts, url);

          results.push({
            url,
            domain: getDomain(url),
            title,
            anchorText: textParts.anchorText || title,
            snippet: buildCitationSnippet(element),
            position: elementIndex + 1,
            sourceType: classifySourceType(url, title, textParts.fullText || ''),
            sourceRole: 'third_party',
            isTargetDomain: false,
            isCompetitorDomain: false,
            sourcePanel: 'doubao_attribute_urls',
            extractionMethod: answerRoot?.contains(element) ? `answer_${attributeName}` : `page_${attributeName}`
          });
        });
      });
    });

    return results;
  }

  function extractRawDocumentUrlCitations() {
    const chunks = [
      ...Array.from(document.querySelectorAll('script')).map(script => script.textContent || ''),
      document.documentElement?.innerHTML || ''
    ].filter(Boolean);
    const urls = Array.from(new Set(chunks.flatMap(chunk => extractUrlsFromText(chunk)).slice(0, 1500)));

    return urls.map((rawUrl, index) => {
      const url = normalizeDoubaoUrl(rawUrl);
      if (!isUsableExternalCitationUrl(url) || isLikelyAssetUrl(url)) return null;

      const domain = getDomain(url);

      return {
        url,
        domain,
        title: domain || url,
        anchorText: domain || url,
        snippet: '',
        position: index + 1,
        sourceType: classifySourceType(url, domain || url, ''),
        sourceRole: 'third_party',
        isTargetDomain: false,
        isCompetitorDomain: false,
        sourcePanel: 'doubao_raw_document_urls',
        extractionMethod: 'raw_document_url'
      };
    }).filter(Boolean);
  }

  function extractUrlsFromText(text) {
    const original = String(text || '');
    const normalizedText = original
      .replace(/\\\//g, '/')
      .replace(/\\u0026/g, '&')
      .replace(/&amp;/g, '&');
    const encodedMatches = normalizedText.match(/https?%3A%2F%2F[^\s"'<>\\\]}),]+/gi) || [];
    const decodedValues = [normalizedText];

    try {
      const decoded = decodeURIComponent(normalizedText);
      if (decoded !== normalizedText) decodedValues.push(decoded);
    } catch (error) {
      // Keep the original value when decoding fails.
    }

    encodedMatches.forEach(match => {
      try {
        decodedValues.push(decodeURIComponent(match));
      } catch (error) {
        // Ignore malformed encoded URL candidates.
      }
    });

    return Array.from(new Set(decodedValues.flatMap(value => {
      const matches = String(value).match(/https?:\/\/[^\s"'<>\\\]}),]+/gi) || [];
      return matches.map(match => match.replace(/[),.;，。]+$/g, ''));
    })));
  }

  function normalizeDoubaoUrl(rawUrl, depth = 0) {
    if (!rawUrl || depth > 3) return '';

    let normalized = normalizeCitationUrl(rawUrl);
    if (!normalized) {
      try {
        normalized = new URL(rawUrl, window.location.href).href;
      } catch (error) {
        return '';
      }
    }

    try {
      const url = new URL(normalized);
      const targetParam = [
        'url',
        'target',
        'target_url',
        'href',
        'link',
        'source',
        'src',
        'u',
        'q',
        'redirect',
        'redirect_url'
      ].map(param => url.searchParams.get(param)).find(value => value && /^https?:\/\//i.test(value));

      if (targetParam) {
        return normalizeDoubaoUrl(targetParam, depth + 1);
      }

      return normalized;
    } catch (error) {
      return normalized;
    }
  }

  function isUsableExternalCitationUrl(url) {
    if (!url) return false;

    try {
      const parsed = new URL(url);
      const current = new URL(window.location.href);
      const hostname = parsed.hostname.replace(/^www\./, '');
      const currentHostname = current.hostname.replace(/^www\./, '');

      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
      if (hostname === currentHostname) return false;
      if (hostname.endsWith('doubao.com')) return false;
      if (isNonCitationAssetHost(hostname)) return false;

      return true;
    } catch (error) {
      return false;
    }
  }

  function isNonCitationAssetHost(hostname) {
    return [
      /(^|\.)doubao\.com$/,
      /(^|\.)byteacctimg\.com$/,
      /(^|\.)byteimg\.com$/,
      /(^|\.)bytednsdoc\.com$/,
      /(^|\.)ibytedapm\.com$/,
      /(^|\.)bytescm\.com$/,
      /(^|\.)bytedance\.com$/,
      /(^|\.)lf-flow-web-cdn\.doubao\.com$/,
      /tos-cn-/,
      /passport/,
      /favicon/,
      /avatar/
    ].some(pattern => pattern.test(hostname));
  }

  function isLikelyInternalServiceUrl(url) {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      return [
        'snssdk.com',
        'amemv.com',
        'ibytedtos.com',
        'volccdn.com',
        'bytegoofy.com',
        'pstatp.com',
        'ibytedapm.com',
        'bytednsdoc.com',
        'bytescm.com',
        'bytedance.com',
        'byteacctimg.com',
        'byteimg.com',
        'doubao.com'
      ].some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
    } catch (error) {
      return false;
    }
  }

  function isLikelyAssetUrl(url) {
    try {
      const parsed = new URL(url);
      const decoded = decodeURIComponent(url);
      return /w3\.org\/2000\/svg/i.test(decoded) ||
        /<svg|%3csvg/i.test(decoded) ||
        /avatar|user-avatar|\.image/i.test(decoded) ||
        /\.(avif|bmp|css|gif|ico|jpeg|jpg|js|m4a|mp3|mp4|ogg|otf|png|svg|ttf|wav|webm|webp|woff|woff2|image)(\?.*)?$/i.test(parsed.pathname);
    } catch (error) {
      return false;
    }
  }

  function getCitationTextParts(element) {
    const card = element.closest('article, li, section, [role="article"], [class*="card"], [class*="source"], [class*="reference"], [class*="citation"], [class*="search"], div');
    const anchorText = [
      element.innerText,
      element.textContent,
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('title')
    ].find(value => value && value.trim())?.replace(/\s+/g, ' ').trim() || '';
    const fullText = (card?.innerText || card?.textContent || anchorText || '')
      .replace(/\s+/g, ' ')
      .trim();

    return { anchorText: anchorText.slice(0, 240), fullText: fullText.slice(0, 500) };
  }

  function pickCitationTitle(textParts, url) {
    const domain = getDomain(url);
    const candidate = [textParts.anchorText, textParts.fullText]
      .find(value => value && value.length >= 2 && !/^https?:\/\//i.test(value));

    return (candidate || domain || url).slice(0, 160);
  }

  function buildCitationSnippet(element) {
    const textParts = getCitationTextParts(element);
    const snippet = textParts.fullText || textParts.anchorText;
    return snippet.slice(0, 300);
  }

  function getDomain(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (error) {
      return '';
    }
  }

  function safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  function parsePossibleJsonObjectsFromText(text) {
    const objects = [];
    const whole = safeJsonParse(text);
    if (whole) objects.push(whole);

    String(text || '').split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('data:')) {
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') return;

        const parsed = safeJsonParse(data);
        if (parsed) objects.push(parsed);
        return;
      }

      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const parsed = safeJsonParse(trimmed);
        if (parsed) objects.push(parsed);
      }
    });

    return objects;
  }

  function walkObject(value, visitor, seen = new WeakSet()) {
    if (!value || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);

    visitor(value);

    if (Array.isArray(value)) {
      value.forEach(item => walkObject(item, visitor, seen));
      return;
    }

    Object.values(value).forEach(item => {
      if (item && typeof item === 'object') {
        walkObject(item, visitor, seen);
        return;
      }

      if (typeof item === 'string' && item.includes('{') && item.length < 1000000) {
        const parsed = safeJsonParse(item);
        if (parsed) walkObject(parsed, visitor, seen);
      }
    });
  }

  function normalizeDoubaoTextCard(card, fallbackIndex) {
    const url = normalizeDoubaoUrl(card?.url || '');
    if (!card || !url || !isUsableExternalCitationUrl(url)) return null;

    const domain = getDomain(url);
    const rank = Number(card.index || fallbackIndex);

    return {
      title: cleanDoubaoTitle(card.title) || card.sitename || domain || url,
      sourceName: card.sitename || '',
      url,
      domain,
      snippet: card.summary || '',
      logoUrl: card.logo_url || '',
      position: rank,
      visibleRank: rank,
      originalDocRank: card.original_doc_rank ?? '',
      publishTime: card.publish_time_second || '',
      docId: card.doc_id || '',
      searchId: card.search_id || '',
      sourceFrom: card.source_from ?? '',
      sourceTypeRaw: card.source_type ?? '',
      sourceType: 'search_result',
      sourceRole: 'third_party',
      isTargetDomain: false,
      isCompetitorDomain: false,
      sourcePanel: 'doubao_network_search_query_result_block',
      extractionMethod: 'network_search_result',
      raw: card
    };
  }

  function extractDoubaoCitationsFromNetworkResponses(runContext = null, finishedAt = Date.now()) {
    const citations = [];
    const responses = filterDoubaoNetworkResponsesForRun(runContext, finishedAt);

    responses.forEach(response => {
      const objects = parsePossibleJsonObjectsFromText(response.text);

      objects.forEach(object => {
        walkObject(object, node => {
          const searchBlock = node.search_query_result_block;
          const results = Array.isArray(searchBlock?.results) ? searchBlock.results : [];

          results.forEach(result => {
            const citation = normalizeDoubaoTextCard(result?.text_card, citations.length + 1);
            if (!citation) return;

            citation.networkUrl = response.url;
            citation.capturedAt = response.capturedAt;
            citation.runId = response.runId || runContext?.runId || '';
            citation.promptHash = response.promptHash || runContext?.promptHash || '';
            citation.requestId = response.requestId || '';
            citation.conversationId = response.conversationId || '';
            citation.messageId = response.messageId || '';
            citations.push(citation);
          });

          const textCardCitation = normalizeDoubaoTextCard(node.text_card, citations.length + 1);
          if (textCardCitation) {
            textCardCitation.networkUrl = response.url;
            textCardCitation.capturedAt = response.capturedAt;
            textCardCitation.runId = response.runId || runContext?.runId || '';
            textCardCitation.promptHash = response.promptHash || runContext?.promptHash || '';
            textCardCitation.requestId = response.requestId || '';
            textCardCitation.conversationId = response.conversationId || '';
            textCardCitation.messageId = response.messageId || '';
            citations.push(textCardCitation);
          }

          const image = node.image;
          const imageUrl = normalizeDoubaoUrl(image?.main_site_url || '');
          if (image && imageUrl && isUsableExternalCitationUrl(imageUrl)) {
            citations.push({
              title: image.img_caption || image.origin_query || imageUrl,
              sourceName: image.source_app_name || '',
              url: imageUrl,
              domain: getDomain(imageUrl),
              snippet: image.origin_query || '',
              logoUrl: image.source_app_icon || '',
              position: citations.length + 1,
              visibleRank: null,
              docId: image.doc_id || '',
              searchId: image.search_id || '',
              sourceType: 'media',
              sourceRole: 'third_party',
              isTargetDomain: false,
              isCompetitorDomain: false,
              sourcePanel: 'doubao_network_media',
              extractionMethod: 'network_media',
              networkUrl: response.url,
              capturedAt: response.capturedAt,
              runId: response.runId || runContext?.runId || '',
              promptHash: response.promptHash || runContext?.promptHash || '',
              requestId: response.requestId || '',
              conversationId: response.conversationId || '',
              messageId: response.messageId || '',
              raw: image
            });
          }
        });
      });
    });

    return mergeDoubaoCitations(citations);
  }

  async function revealDoubaoReferences() {
    const triggers = findReferenceTriggers();
    let clicked = 0;

    for (const trigger of triggers.slice(0, 4)) {
      try {
        trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        trigger.click();
        clicked += 1;
        await delay(350);
      } catch (error) {
        // Continue trying other candidate controls.
      }
    }

    return clicked;
  }

  async function scrollDoubaoReferencePanels() {
    const panels = findDoubaoReferencePanels();

    for (const panel of panels) {
      const scrollables = [panel, ...Array.from(panel.querySelectorAll('div, section, aside'))]
        .filter(element => element.scrollHeight > element.clientHeight + 40);

      for (const element of scrollables.slice(0, 4)) {
        const maxScroll = element.scrollHeight - element.clientHeight;
        const step = Math.max(180, Math.floor(element.clientHeight * 0.75));

        for (let top = 0; top <= maxScroll; top += step) {
          element.scrollTop = top;
          element.dispatchEvent(new Event('scroll', { bubbles: true }));
          await delay(120);
        }

        element.scrollTop = maxScroll;
        element.dispatchEvent(new Event('scroll', { bubbles: true }));
        await delay(180);
      }
    }
  }

  function findReferenceTriggers() {
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], a, div, span'))
      .filter(element => !element.closest('#insidebar-china-save-conversation'))
      .filter(isVisibleElement)
      .filter(element => {
        const text = [
          element.innerText,
          element.textContent,
          element.getAttribute?.('aria-label'),
          element.getAttribute?.('title')
        ].find(value => value && value.trim())?.replace(/\s+/g, ' ').trim() || '';
        if (!text || text.length > 80) return false;

        return /参考资料|引用来源|资料来源|引用|来源|Sources?|References?/i.test(text);
      });

    return candidates.sort((a, b) => getClickablePriority(b) - getClickablePriority(a));
  }

  function getClickablePriority(element) {
    const tag = element.tagName?.toLowerCase();
    if (tag === 'button') return 4;
    if (tag === 'a') return 3;
    if (element.getAttribute?.('role') === 'button') return 2;
    return 1;
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function extractJsonObjectFromAssignment(scriptText, assignmentName) {
    const anchor = `${assignmentName} =`;
    const anchorIndex = scriptText.indexOf(anchor);

    if (anchorIndex < 0) return null;

    const jsonStart = scriptText.indexOf('{', anchorIndex);
    if (jsonStart < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = jsonStart; i < scriptText.length; i += 1) {
      const char = scriptText[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;

        if (depth === 0) {
          return JSON.parse(scriptText.slice(jsonStart, i + 1));
        }
      }
    }

    return null;
  }

  function getDoubaoRouterDataFromScripts() {
    const scripts = Array.from(document.querySelectorAll('script'));

    for (const script of scripts) {
      const text = script.textContent || '';

      if (!text.includes('window._ROUTER_DATA')) continue;
      if (!text.includes('trimmedChainRecentConvCells')) continue;

      try {
        const data = extractJsonObjectFromAssignment(text, 'window._ROUTER_DATA');
        if (data) return data;
      } catch (error) {
        console.warn('[Doubao Extractor] Failed to parse _ROUTER_DATA:', error);
      }
    }

    return null;
  }

  function getDoubaoMessagesFromRouterData(routerData) {
    const chatLayout = routerData?.loaderData?.chat_layout?.chat_layout ||
      routerData?.loaderData?.chat_layout;
    const cells = chatLayout?.trimmedChainRecentConvCells || [];

    return cells.flatMap(cell => cell?.conversation?.messages || []);
  }

  function getTextFromDoubaoMessage(message) {
    const blocks = Array.isArray(message?.content_block) ? message.content_block : [];

    return blocks
      .filter(block => Number(block?.block_type) === 10000)
      .map(block => block?.content?.text_block?.text || '')
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }

  function cleanDoubaoTitle(title = '') {
    const value = String(title || '').trim();
    if (!value || value === '{}') return '';
    return value;
  }

  function parseJsonMaybe(value) {
    if (!value || typeof value !== 'string') return null;

    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function extractDoubaoSearchCitationsFromMessage(message) {
    const blocks = Array.isArray(message?.content_block) ? message.content_block : [];
    const citations = [];

    blocks.forEach(block => {
      const searchBlock = block?.content?.search_query_result_block;
      const results = Array.isArray(searchBlock?.results) ? searchBlock.results : [];

      results.forEach(result => {
        const card = result?.text_card;
        const url = normalizeDoubaoUrl(card?.url || '');
        if (!card || !url || !isUsableExternalCitationUrl(url)) return;

        citations.push({
          title: cleanDoubaoTitle(card.title) || card.sitename || url,
          url,
          domain: getDomain(url),
          sourceName: card.sitename || '',
          snippet: card.summary || '',
          logoUrl: card.logo_url || '',
          position: Number(card.index || citations.length + 1),
          visibleRank: Number(card.index || citations.length + 1),
          originalDocRank: card.original_doc_rank ?? '',
          publishTime: card.publish_time_second || '',
          docId: card.doc_id || '',
          searchId: card.search_id || '',
          sourceFrom: card.source_from ?? '',
          sourceTypeRaw: card.source_type ?? '',
          sourceType: 'search_result',
          sourceRole: 'third_party',
          isTargetDomain: false,
          isCompetitorDomain: false,
          sourcePanel: 'doubao_search_query_result_block',
          extractionMethod: 'router_data_search_result',
          raw: card
        });
      });
    });

    return citations;
  }

  function extractDoubaoMediaCitationsFromMessage(message) {
    const blocks = Array.isArray(message?.content_block) ? message.content_block : [];
    const citations = [];

    blocks.forEach(block => {
      const metaInfo = Array.isArray(block?.meta_info) ? block.meta_info : [];

      metaInfo.forEach(meta => {
        const payload = parseJsonMaybe(meta.info) || parseJsonMaybe(meta.tag_info);
        const mediaItems = Array.isArray(payload?.media) ? payload.media : [];

        mediaItems.forEach(media => {
          const image = media?.image;
          const url = normalizeDoubaoUrl(image?.main_site_url || '');
          if (!image || !url || !isUsableExternalCitationUrl(url)) return;

          citations.push({
            title: image.img_caption || image.origin_query || url,
            url,
            domain: getDomain(url),
            sourceName: image.source_app_name || '',
            snippet: image.origin_query || '',
            logoUrl: image.source_app_icon || '',
            position: citations.length + 1,
            visibleRank: null,
            docId: image.doc_id || '',
            searchId: image.search_id || '',
            sourceType: 'media',
            sourceRole: 'third_party',
            isTargetDomain: false,
            isCompetitorDomain: false,
            sourcePanel: 'doubao_meta_info_media',
            extractionMethod: 'router_data_media',
            raw: image
          });
        });
      });
    });

    return citations;
  }

  function findLatestDoubaoAssistantMessage(messages) {
    return [...messages].reverse().find(message => {
      const isAssistant = Number(message?.user_type) === 2;
      const hasBlocks = Array.isArray(message?.content_block);
      const hasText = Boolean(getTextFromDoubaoMessage(message));
      const hasSearchBlock = message?.content_block?.some(block => block?.content?.search_query_result_block);

      return isAssistant && hasBlocks && (hasText || hasSearchBlock);
    });
  }

  function findUserMessageBefore(messages, assistantMessage) {
    const index = messages.indexOf(assistantMessage);
    if (index <= 0) return null;

    return [...messages.slice(0, index)]
      .reverse()
      .find(message => Number(message?.user_type) === 1);
  }

  function extractDoubaoConversationFromRouterData(provider) {
    const routerData = getDoubaoRouterDataFromScripts();
    if (!routerData) return null;

    const messages = getDoubaoMessagesFromRouterData(routerData);
    const assistantMessage = findLatestDoubaoAssistantMessage(messages);
    if (!assistantMessage) return null;

    const userMessage = findUserMessageBefore(messages, assistantMessage);
    const answerText = getTextFromDoubaoMessage(assistantMessage);
    const query = getTextFromDoubaoMessage(userMessage) || '';
    const searchCitations = extractDoubaoSearchCitationsFromMessage(assistantMessage);
    const mediaCitations = extractDoubaoMediaCitationsFromMessage(assistantMessage);
    const citations = mergeDoubaoCitations([...searchCitations, ...mediaCitations]);
    const runContext = getRunContextForQuery(query);

    return {
      type: 'geo_run',
      runId: runContext?.runId || '',
      promptHash: runContext?.promptHash || hashPrompt(query),
      title: `豆包审计 - ${query || document.title || '未命名问题'}`,
      content: `${query ? `User: ${query}\n\n` : ''}Assistant:\n${answerText}\n\n### Sources\n${citations.map((source, index) => `${index + 1}. [${source.title || source.domain}](${source.url})`).join('\n')}`,
      messages: [
        { role: 'user', content: query },
        { role: 'assistant', content: answerText, sources: citations }
      ],
      product: query,
      query,
      answerText,
      answerMarkdown: answerText,
      citations,
      provider: provider.id,
      providerName: provider.name,
      timestamp: Date.now(),
      url: window.location.href,
      rawEvidence: {
        pageTitle: document.title,
        source: 'doubao_router_data',
        extractionStrategy: 'doubao_router_data',
        citationCount: citations.length,
        searchCitationCount: searchCitations.length,
        mediaCitationCount: mediaCitations.length,
        runId: runContext?.runId || '',
        promptHash: runContext?.promptHash || hashPrompt(query),
        runStartedAt: runContext?.startedAt || null,
        conversationId: assistantMessage.conversation_id || '',
        messageId: assistantMessage.message_id || '',
        blocks: assistantMessage.content_block?.map(block => block.block_type) || []
      }
    };
  }

  function refreshConversationSources(conversation, citations, source, runContext = null) {
    const sourcesMarkdown = citations.length > 0
      ? '\n\n### Sources\n' + citations.map((item, index) => `${index + 1}. [${item.title || item.domain}](${item.url})`).join('\n')
      : '';
    const queryPrefix = conversation.query ? `User: ${conversation.query}\n\n` : '';
    const answer = conversation.answerText || conversation.answerMarkdown || '';

    conversation.citations = citations;
    conversation.content = `${queryPrefix}Assistant:\n${answer}${sourcesMarkdown}`;
    conversation.messages = [
      ...(conversation.query ? [{ role: 'user', content: conversation.query }] : []),
      { role: 'assistant', content: answer, sources: citations }
    ];
    conversation.rawEvidence = {
      ...conversation.rawEvidence,
      source,
      runId: runContext?.runId || conversation.rawEvidence?.runId || '',
      promptHash: runContext?.promptHash || conversation.rawEvidence?.promptHash || '',
      runStartedAt: runContext?.startedAt || conversation.rawEvidence?.runStartedAt || null,
      citationCount: citations.length,
      networkResponseCount: doubaoNetworkResponses.length,
      boundNetworkResponseCount: filterDoubaoNetworkResponsesForRun(runContext, Date.now()).length,
      networkCitationCount: citations.filter(citation => citation.extractionMethod?.startsWith('network_')).length
    };
    conversation.runId = runContext?.runId || conversation.runId || '';
    conversation.promptHash = runContext?.promptHash || conversation.promptHash || '';

    return conversation;
  }

  function extractConversation(provider) {
    if (provider.id === 'doubao') {
      const doubaoConversation = extractDoubaoConversationFromRouterData(provider);

      if (doubaoConversation && (doubaoConversation.answerText || doubaoConversation.citations.length > 0)) {
        const runContext = getRunContextForQuery(doubaoConversation.query);
        const finishedAt = Date.now();
        const citations = mergeDoubaoCitations([
          ...extractDoubaoCitationsFromNetworkResponses(runContext, finishedAt),
          ...doubaoConversation.citations
        ]);

        if (citations.length !== doubaoConversation.citations.length) {
          return refreshConversationSources(doubaoConversation, citations, 'doubao_router_data_with_network', runContext);
        }

        doubaoConversation.rawEvidence.networkResponseCount = doubaoNetworkResponses.length;
        doubaoConversation.rawEvidence.boundNetworkResponseCount = filterDoubaoNetworkResponsesForRun(runContext, finishedAt).length;
        doubaoConversation.rawEvidence.networkCitationCount = citations.filter(citation => citation.extractionMethod?.startsWith('network_')).length;
        return doubaoConversation;
      }
    }

    const answerRoot = extractAnswerRoot();
    const answerMarkdown = extractMarkdownFromElement(answerRoot).trim();
    const answerText = answerRoot.innerText?.trim() || answerMarkdown;
    const product = extractProduct();
    const query = product;
    const runContext = getRunContextForQuery(query);
    const finishedAt = Date.now();
    const citations = mergeDoubaoCitations([
      ...extractDoubaoCitationsFromNetworkResponses(runContext, finishedAt),
      ...extractVisibleReferenceItems(),
      ...extractCitationCards(answerRoot),
      ...extractExternalLinks(answerRoot),
      ...extractDoubaoReferencePanelCitations(),
      ...extractPageWideCitations(answerRoot)
    ]);

    if (!answerMarkdown && citations.length === 0) {
      throw new Error('No visible answer or sources found');
    }

    const messages = [];
    if (query) {
      messages.push({ role: 'user', content: query });
    }
    messages.push({
      role: 'assistant',
      content: answerMarkdown || answerText,
      sources: citations
    });

    const sourcesMarkdown = citations.length > 0
      ? '\n\n### Sources\n' + citations.map((source, index) => `${index + 1}. [${source.title || source.domain}](${source.url})`).join('\n')
      : '';

    return {
      type: 'geo_run',
      runId: runContext?.runId || '',
      promptHash: runContext?.promptHash || hashPrompt(query),
      title: getConversationTitle(provider),
      content: `${formatMessagesAsText(messages)}${sourcesMarkdown}`,
      messages,
      product,
      query,
      answerText,
      answerMarkdown: answerMarkdown || answerText,
      citations,
      provider: provider.id,
      providerName: provider.name,
      timestamp: Date.now(),
      url: window.location.href,
      rawEvidence: {
        pageTitle: document.title,
        source: 'doubao_dom',
        extractionStrategy: 'doubao_network_visible_dom_and_reference_panel',
        runId: runContext?.runId || '',
        promptHash: runContext?.promptHash || hashPrompt(query),
        runStartedAt: runContext?.startedAt || null,
        linkCount: citations.length,
        citationCount: citations.length,
        networkResponseCount: doubaoNetworkResponses.length,
        boundNetworkResponseCount: filterDoubaoNetworkResponsesForRun(runContext, finishedAt).length,
        networkCitationCount: citations.filter(citation => citation.extractionMethod?.startsWith('network_')).length,
        referencePanelCitationCount: citations.filter(citation => citation.sourcePanel === 'doubao_reference_panel').length,
        pageWideCitationCount: citations.filter(citation => citation.extractionMethod?.startsWith('page_')).length
      }
    };
  }

  function mergeDoubaoCitations(citations) {
    const seen = new Set();
    const merged = [];

    citations.forEach(citation => {
      if (!citation) return;
      const normalizedUrl = citation.url ? normalizeDoubaoUrl(citation.url) : '';
      const key = normalizedUrl || [
        citation.title,
        citation.domain,
        citation.snippet || citation.anchorText
      ].filter(Boolean).join('|').replace(/\s+/g, '').slice(0, 240);

      if (!key || seen.has(key)) return;
      if (normalizedUrl && (isLikelyAssetUrl(normalizedUrl) || isLikelyInternalServiceUrl(normalizedUrl))) return;

      seen.add(key);
      merged.push({
        ...citation,
        url: normalizedUrl,
        domain: citation.domain || (normalizedUrl ? getDomain(normalizedUrl) : ''),
        position: merged.length + 1,
        visibleRank: merged.length + 1
      });
    });

    return merged;
  }

  function setSaveButtonState(state) {
    if (!saveButton) return;
    const label = saveButton.querySelector('.insidebar-china-save-label');
    const isBusy = state === 'saving';

    saveButton.disabled = isBusy;
    saveButton.setAttribute('aria-busy', String(isBusy));

    if (label) {
      if (state === 'saving') label.textContent = '保存中...';
      if (state === 'saved') label.textContent = '已保存';
      if (state === 'unchanged') label.textContent = '内容未变化';
      if (state === 'idle') label.textContent = '保存豆包回答';
    }

    if (state === 'saved' || state === 'unchanged') {
      setTimeout(() => setSaveButtonState('idle'), 1600);
    }
  }

  async function handleSaveClick(event) {
    event?.preventDefault();
    event?.stopPropagation();

    const provider = getProvider();
    if (!provider || !saveButton) return;

    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      showNotification('Extension API not available. Please reload this Doubao page and try again.', 'error');
      return;
    }

    setSaveButtonState('saving');

    try {
      await revealDoubaoReferences();
      await scrollDoubaoReferencePanels();
      const conversation = extractConversation(provider);
      console.log('[AI GEO] Extraction strategy:', conversation.rawEvidence?.extractionStrategy);
      console.log('[AI GEO] Doubao network responses:', doubaoNetworkResponses.length);
      console.log('[AI GEO] Doubao citations:', conversation.citations);
      conversation.conversationId = generateConversationId(conversation.url, conversation.title);
      downloadLocalFiles(conversation);

      const duplicateCheck = await checkForDuplicate(conversation.conversationId);
      if (duplicateCheck.isDuplicate) {
        const existingContent = (duplicateCheck.existingConversation.content || '').trim();
        const newContent = (conversation.content || '').trim();

        if (existingContent === newContent) {
          setSaveButtonState('saved');
          showNotification('历史内容未变化，已下载 MD / CSV 到本地', 'success');
          return;
        }

        conversation.overwriteId = duplicateCheck.existingConversation.id;
        conversation.timestamp = duplicateCheck.existingConversation.timestamp;
      }

      chrome.runtime.sendMessage({
        action: 'saveConversationFromPage',
        payload: conversation
      }, response => {
        if (chrome.runtime.lastError) {
          setSaveButtonState('idle');
          showNotification('Failed to save: ' + chrome.runtime.lastError.message, 'error');
          return;
        }

        if (!response?.success) {
          setSaveButtonState('idle');
          showNotification('Failed to save: ' + (response?.error || 'Unknown error'), 'error');
          return;
        }

        setSaveButtonState('saved');
        const message = conversation.citations.length > 0
          ? `已下载 MD / CSV，引用源 ${conversation.citations.length} 条`
          : '未找到引用源，已额外下载 debug.json';
        showNotification(message, conversation.citations.length > 0 ? 'success' : 'info');
      });
    } catch (error) {
      setSaveButtonState('idle');
      const message = error.message && error.message.includes('Extension context invalidated')
        ? 'Extension was reloaded. Please reload this Doubao page and save again.'
        : 'Failed to extract conversation: ' + error.message;
      showNotification(message, 'error');
    }
  }

  function downloadLocalFiles(conversation) {
    const baseName = buildDownloadBaseName(conversation);
    downloadTextFile(`${baseName}.md`, buildMarkdownFile(conversation), 'text/markdown;charset=utf-8');
    downloadTextFile(`${baseName}.csv`, buildCsvFile(conversation), 'text/csv;charset=utf-8');
    if (!conversation.citations.length) {
      downloadTextFile(`${baseName}-debug.json`, buildDebugFile(conversation), 'application/json;charset=utf-8');
    }
  }

  function buildDownloadBaseName(conversation) {
    const date = new Date(conversation.timestamp || Date.now());
    const pad = value => String(value).padStart(2, '0');
    const stamp = [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate())
    ].join('') + '-' + [
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds())
    ].join('');
    const title = sanitizeFilename(conversation.product || conversation.query || conversation.title || 'doubao-answer');

    return `doubao-${stamp}-${title}`.slice(0, 160);
  }

  function sanitizeFilename(value) {
    return String(value || '')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'doubao-answer';
  }

  function buildMarkdownFile(conversation) {
    const citations = Array.isArray(conversation.citations) ? conversation.citations : [];
    const metadata = [
      `# ${conversation.title || '豆包回答'}`,
      '',
      `- 平台: ${conversation.providerName || conversation.provider || 'Doubao'}`,
      `- 保存时间: ${new Date(conversation.timestamp || Date.now()).toLocaleString()}`,
      `- 页面: ${conversation.url || window.location.href}`,
      conversation.product ? `- 产品/问题: ${conversation.product}` : '',
      conversation.query ? `- 查询: ${conversation.query}` : '',
      `- 引用源数量: ${citations.length}`
    ].filter(Boolean).join('\n');

    const answer = [
      '',
      '## 答案',
      '',
      conversation.answerMarkdown || conversation.answerText || conversation.content || ''
    ].join('\n');

    const sources = citations.length > 0
      ? [
          '',
          '## 引用源',
          '',
          '| 序号 | 标题 | 域名 | URL | 摘要 |',
          '| --- | --- | --- | --- | --- |',
          ...citations.map((source, index) => [
            index + 1,
            escapeMarkdownTableCell(source.title || source.domain || source.url || ''),
            escapeMarkdownTableCell(source.domain || getDomain(source.url) || ''),
            source.url ? `[打开](${source.url})` : '',
            escapeMarkdownTableCell(source.snippet || source.anchorText || '')
          ].join(' | ')).map(row => `| ${row} |`)
        ].join('\n')
      : '\n\n## 引用源\n\n未提取到引用源。';

    return `${metadata}${answer}${sources}\n`;
  }

  function buildCsvFile(conversation) {
    const citations = Array.isArray(conversation.citations) ? conversation.citations : [];
    const headers = [
      'run_id',
      'prompt_hash',
      'query_time',
      'provider',
      'query',
      'answer',
      'citation_rank',
      'source_title',
      'source_name',
      'source_domain',
      'source_url',
      'snippet',
      'publish_time',
      'doc_id',
      'search_id',
      'source_panel',
      'evidence_type',
      'network_request_url',
      'captured_at',
      'request_id',
      'conversation_id',
      'message_id'
    ];
    const queryTime = new Date(conversation.timestamp || Date.now()).toISOString();
    const answer = conversation.answerText || conversation.answerMarkdown || '';
    const query = conversation.query || conversation.product || '';
    const provider = conversation.provider || conversation.providerName || '';
    const rows = citations.length > 0
      ? citations.map((citation, index) => [
          conversation.runId || citation.runId || '',
          conversation.promptHash || citation.promptHash || '',
          queryTime,
          provider,
          query,
          answer,
          citation.visibleRank || citation.position || index + 1,
          citation.title || '',
          getCitationSourceName(citation),
          citation.domain || getDomain(citation.url) || '',
          citation.url || '',
          citation.snippet || citation.anchorText || '',
          citation.publishTime || '',
          citation.docId || '',
          citation.searchId || '',
          citation.sourcePanel || '',
          citation.extractionMethod || citation.sourceType || '',
          citation.networkUrl || '',
          citation.capturedAt ? new Date(citation.capturedAt).toISOString() : '',
          citation.requestId || '',
          citation.conversationId || '',
          citation.messageId || ''
        ])
      : [[
          conversation.runId || '',
          conversation.promptHash || '',
          queryTime,
          provider,
          query,
          answer,
          ...Array(headers.length - 6).fill('')
        ]];

    return [
      headers.map(escapeCsvCell).join(','),
      ...rows.map(row => row.map(escapeCsvCell).join(','))
    ].join('\n') + '\n';
  }

  function getCitationSourceName(citation) {
    if (citation.sourceName) return citation.sourceName;
    const text = [
      citation.domain,
      citation.title,
      citation.snippet,
      citation.anchorText
    ].filter(Boolean).join(' ');
    const known = text.match(/今日头条|新浪|抖音|小红书|百度|知乎|搜狐|腾讯|网易|携程|大众点评|美团|头条|微博/);
    if (known) return known[0];
    if (citation.domain) return citation.domain;
    return citation.title || citation.anchorText || '参考源';
  }

  function escapeCsvCell(value) {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  }

  function escapeMarkdownTableCell(value) {
    return String(value ?? '')
      .replace(/\|/g, '\\|')
      .replace(/\r?\n/g, '<br>')
      .trim();
  }

  function buildDebugFile(conversation) {
    const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 200).map(anchor => ({
      href: anchor.href || anchor.getAttribute('href') || '',
      text: (anchor.innerText || anchor.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      ariaLabel: anchor.getAttribute('aria-label') || '',
      title: anchor.getAttribute('title') || ''
    }));
    const referenceTriggers = findReferenceTriggers().slice(0, 80).map(element => ({
      tag: element.tagName,
      role: element.getAttribute?.('role') || '',
      text: (element.innerText || element.textContent || element.getAttribute?.('aria-label') || element.getAttribute?.('title') || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200)
    }));
    const rawUrlCandidates = extractUrlsFromText(document.documentElement?.innerHTML || '').slice(0, 300);
    const networkResponses = doubaoNetworkResponses.map(response => ({
      url: response.url,
      transport: response.transport,
      capturedAt: response.capturedAt,
      runId: response.runId || '',
      promptHash: response.promptHash || '',
      conversationId: response.conversationId || '',
      messageId: response.messageId || '',
      requestId: response.requestId || '',
      length: response.text?.length || 0,
      hasSearchQueryResultBlock: Boolean(response.text?.includes('search_query_result_block')),
      hasTextCard: Boolean(response.text?.includes('text_card')),
      hasMainSiteUrl: Boolean(response.text?.includes('main_site_url')),
      hasContentBlock: Boolean(response.text?.includes('content_block')),
      preview: String(response.text || '').slice(0, 500)
    }));

    return JSON.stringify({
      savedAt: new Date(conversation.timestamp || Date.now()).toISOString(),
      pageUrl: window.location.href,
      title: document.title,
      citationCount: conversation.citations.length,
      networkResponseCount: doubaoNetworkResponses.length,
      boundNetworkResponseCount: filterDoubaoNetworkResponsesForRun(getRunContextForQuery(conversation.query || conversation.product || ''), conversation.timestamp || Date.now()).length,
      runId: conversation.runId || '',
      promptHash: conversation.promptHash || '',
      networkCitationCount: conversation.citations.filter(citation => citation.extractionMethod?.startsWith('network_')).length,
      linkCount: links.length,
      referenceTriggerCount: referenceTriggers.length,
      rawUrlCandidateCount: rawUrlCandidates.length,
      networkResponses,
      links,
      referenceTriggers,
      rawUrlCandidates
    }, null, 2);
  }

  function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
})();
