// Doubao Conversation Extractor
// Extracts the visible answer and citation links from Doubao.
//
// IMPORTANT: Requires conversation-extractor-utils.js and language-detector.js.

(function() {
  'use strict';

  const {
    extractMarkdownFromElement,
    extractExternalLinks,
    extractCitationCards,
    dedupeCitations,
    formatMessagesAsText,
    generateConversationId,
    checkForDuplicate,
    showNotification,
    setupKeyboardShortcut
  } = window.ConversationExtractorUtils;

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function getProvider() {
    return PROVIDERS[window.location.hostname] || null;
  }

  function init() {
    const provider = getProvider();
    if (!provider || window !== window.top) return;

    setTimeout(() => {
      insertSaveButton(provider);
      observeForChanges(provider);
    }, 1200);
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
      <span>保存豆包回答</span>
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

  function extractProduct() {
    const remembered = getRememberedProduct();
    if (remembered) return remembered;

    const candidates = Array.from(document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"], [role="textbox"]'))
      .filter(isVisibleElement)
      .map(element => (element.value || element.textContent || '').trim())
      .filter(text => text.length > 0);

    return candidates[candidates.length - 1] || '';
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

  function extractConversation(provider) {
    const answerRoot = extractAnswerRoot();
    const answerMarkdown = extractMarkdownFromElement(answerRoot).trim();
    const answerText = answerRoot.innerText?.trim() || answerMarkdown;
    const product = extractProduct();
    const query = product;
    const citations = dedupeCitations([
      ...extractCitationCards(answerRoot),
      ...extractExternalLinks(answerRoot),
      ...extractDoubaoReferencePanelCitations()
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
        extractionStrategy: 'doubao_visible_dom_and_reference_panel',
        linkCount: citations.length,
        citationCount: citations.length,
        referencePanelCitationCount: citations.filter(citation => citation.sourcePanel === 'doubao_reference_panel').length
      }
    };
  }

  function setSaveButtonBusy(isBusy) {
    if (!saveButton) return;
    saveButton.disabled = isBusy;
    saveButton.setAttribute('aria-busy', String(isBusy));
  }

  async function handleSaveClick(event) {
    event?.preventDefault();
    event?.stopPropagation();

    const provider = getProvider();
    if (!provider || !saveButton) return;

    setSaveButtonBusy(true);

    try {
      const conversation = extractConversation(provider);
      conversation.conversationId = generateConversationId(conversation.url, conversation.title);

      const duplicateCheck = await checkForDuplicate(conversation.conversationId);
      if (duplicateCheck.isDuplicate) {
        const existingContent = (duplicateCheck.existingConversation.content || '').trim();
        const newContent = (conversation.content || '').trim();

        if (existingContent === newContent) {
          setSaveButtonBusy(false);
          return;
        }

        conversation.overwriteId = duplicateCheck.existingConversation.id;
        conversation.timestamp = duplicateCheck.existingConversation.timestamp;
      }

      chrome.runtime.sendMessage({
        action: 'saveConversationFromPage',
        payload: conversation
      }, response => {
        setSaveButtonBusy(false);

        if (chrome.runtime.lastError) {
          showNotification('Failed to save: ' + chrome.runtime.lastError.message, 'error');
          return;
        }

        if (!response?.success) {
          showNotification('Failed to save: ' + (response?.error || 'Unknown error'), 'error');
        }
      });
    } catch (error) {
      setSaveButtonBusy(false);
      const message = error.message && error.message.includes('Extension context invalidated')
        ? 'Extension was reloaded. Please reload this Doubao page and save again.'
        : 'Failed to extract conversation: ' + error.message;
      showNotification(message, 'error');
    }
  }

  setupKeyboardShortcut(() => handleSaveClick(), () => Boolean(getProvider()));
})();
