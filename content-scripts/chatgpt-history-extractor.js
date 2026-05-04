// ChatGPT Conversation History Extractor
// Extracts current conversation from ChatGPT.com DOM and saves to extension
//
// IMPORTANT: Requires conversation-extractor-utils.js to be loaded first

(function() {
  'use strict';

  console.log('[ChatGPT Extractor] Script loaded');

  // Import shared utilities from global namespace
  const {
    extractMarkdownFromElement,
    formatMessagesAsText,
    generateConversationId,
    checkForDuplicate,
    showDuplicateWarning,
    showNotification,
    setupKeyboardShortcut,
    extractExternalLinks,
    extractCitationCards,
    dedupeCitations,
    normalizeCitationUrl
  } = window.ConversationExtractorUtils;

  // Share button selector for language detection
  const SHARE_BUTTON_SELECTOR = '[data-testid="share-chat-button"]';

  let saveButton = null;

  // Initialize after page loads
  if (!window.__INSIDEBAR_CHATGPT_EXTRACTOR_SKIP_AUTO_INIT__) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  function init() {
    console.log('[ChatGPT Extractor] Initializing...');
    console.log('[ChatGPT Extractor] In iframe?', window !== window.top);
    console.log('[ChatGPT Extractor] URL:', window.location.href);

    // Wait a bit for ChatGPT to fully render. Keep observing because ChatGPT
    // navigates between homepage and conversations without a full page reload.
    setTimeout(() => {
      console.log('[ChatGPT Extractor] Attempting to insert save button...');
      insertSaveButton();
      observeForShareButton();
    }, 2000);
  }

  function isChatGPTConversationPage() {
    const host = window.location.hostname;
    const isChatGPTHost = host === 'chatgpt.com' || host === 'chat.openai.com';

    return isChatGPTHost && window.location.pathname.includes('/c/');
  }

  // Create save button matching ChatGPT's UI
  function createSaveButton() {
    // Detect provider's UI language and get matching Save button text
    const { text, tooltip } = window.LanguageDetector.getSaveButtonText(SHARE_BUTTON_SELECTOR);

    const button = document.createElement('button');
    button.id = 'insidebar-save-conversation';
    button.className = 'btn relative btn-ghost text-token-text-primary mx-2';
    button.setAttribute('aria-label', text);
    button.innerHTML = `
      <div class="flex w-full items-center justify-center gap-1.5">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="-ms-0.5 icon">
          <path d="M2.66820931,12.6663 L2.66820931,12.5003 C2.66820931,12.1331 2.96598,11.8353 3.33325,11.8353 C3.70052,11.8353 3.99829,12.1331 3.99829,12.5003 L3.99829,12.6663 C3.99829,13.3772 3.9992,13.8707 4.03052,14.2542 C4.0612,14.6298 4.11803,14.8413 4.19849,14.9993 L4.2688,15.1263 C4.44511,15.4137 4.69813,15.6481 5.00024,15.8021 L5.13013,15.8577 C5.2739,15.9092 5.46341,15.947 5.74536,15.97 C6.12888,16.0014 6.62221,16.0013 7.33325,16.0013 L12.6663,16.0013 C13.3771,16.0013 13.8707,16.0014 14.2542,15.97 C14.6295,15.9394 14.8413,15.8825 14.9993,15.8021 L15.1262,15.7308 C15.4136,15.5545 15.6481,15.3014 15.802,14.9993 L15.8577,14.8695 C15.9091,14.7257 15.9469,14.536 15.97,14.2542 C16.0013,13.8707 16.0012,13.3772 16.0012,12.6663 L16.0012,12.5003 C16.0012,12.1332 16.2991,11.8355 16.6663,11.8353 C17.0335,11.8353 17.3313006,12.1331 17.3313006,12.5003 L17.3313006,12.6663 C17.3313006,13.3553 17.3319,13.9124 17.2952,14.3626 C17.2624,14.7636 17.1974,15.1247 17.053,15.4613 L16.9866,15.6038 C16.7211,16.1248 16.3172,16.5605 15.8215,16.8646 L15.6038,16.9866 C15.227,17.1786 14.8206,17.2578 14.3625,17.2952 C13.9123,17.332 13.3553,17.3314006 12.6663,17.3314006 L7.33325,17.3314006 C6.64416,17.3314006 6.0872,17.332 5.63696,17.2952 C5.23642,17.2625 4.87552,17.1982 4.53931,17.054 L4.39673,16.9866 C3.87561,16.7211 3.43911,16.3174 3.13501,15.8216 L3.01294,15.6038 C2.82097,15.2271 2.74177,14.8206 2.70435,14.3626 C2.66758,13.9124 2.66820931,13.3553 2.66820931,12.6663 Z M9.33521,3.33339 L9.33521,10.89489 L7.13696,8.69665 C6.87732,8.43701 6.45625,8.43712 6.19653,8.69665 C5.93684,8.95635 5.93684,9.37738 6.19653,9.63708 L9.52954,12.97106 L9.6311,13.05407 C9.73949,13.12627 9.86809,13.1654 10.0002,13.1654 C10.1763,13.1654 10.3454,13.0955 10.47,12.97106 L13.804,9.63708 C14.0633,9.37741 14.0634,8.95625 13.804,8.69665 C13.5443,8.43695 13.1222,8.43695 12.8625,8.69665 L10.6653,10.89392 L10.6653,3.33339 C10.6651,2.96639 10.3673,2.66849 10.0002,2.66829 C9.63308,2.66829 9.33538,2.96629 9.33521,3.33339 Z"></path>
        </svg>
        ${text}
      </div>
    `;
    button.title = tooltip;
    button.addEventListener('click', handleSaveClick);

    return button;
  }

  // Insert save button after share button
  function insertSaveButton() {
    // Only insert button on conversation pages
    if (!isChatGPTConversationPage()) {
      console.log('[ChatGPT Extractor] Not a conversation page, skipping save button');
      removeFallbackToolbar();
      return;
    }

    // Check if button already exists
    const existingSaveButton = document.getElementById('insidebar-save-conversation');

    if (existingSaveButton) {
      console.log('[ChatGPT Extractor] Save button already exists, ensuring export buttons');
      ensureExportButtons(existingSaveButton);
      return;
    }

    // Find share button
    const shareButton = findShareButton();

    console.log('[ChatGPT Extractor] Looking for share button...');
    console.log('[ChatGPT Extractor] Share button found?', !!shareButton);

    if (!shareButton) {
      console.log('[ChatGPT Extractor] Share button not found, using fixed fallback toolbar');
      console.log('[ChatGPT Extractor] All buttons on page:',
        Array.from(document.querySelectorAll('button')).map(b => ({
          text: b.textContent.substring(0, 30),
          testId: b.getAttribute('data-testid'),
          classes: b.className
        }))
      );
      insertFallbackToolbar();
      return;
    }

    // Check if conversation exists
    const hasConversation = detectConversation();
    console.log('[ChatGPT Extractor] Has conversation?', hasConversation);

    if (!hasConversation) {
      console.log('[ChatGPT Extractor] Conversation content not detected yet, using fixed fallback toolbar');
      insertFallbackToolbar();
      return;
    }

    // Create and insert save button after share button
    saveButton = createSaveButton();
    shareButton.parentElement.insertBefore(saveButton, shareButton.nextSibling);
    ensureExportButtons(saveButton);

    console.log('[ChatGPT Extractor] Save and export buttons inserted after share button');
  }

  function findShareButton() {
    const directMatch = document.querySelector('[data-testid="share-chat-button"]');
    if (directMatch) return directMatch;

    const shareTexts = ['Share', '分享', '共有', 'Поделиться', 'Compartir', 'Partager', 'Teilen', 'Condividi', '공유'];

    return Array.from(document.querySelectorAll('button')).find(button => {
      const label = [
        button.getAttribute('aria-label'),
        button.getAttribute('title'),
        button.textContent
      ].filter(Boolean).join(' ').trim();

      return label && shareTexts.some(text => label.includes(text));
    }) || null;
  }

  function insertFallbackToolbar() {
    if (!isChatGPTConversationPage()) {
      removeFallbackToolbar();
      return;
    }

    let toolbar = document.getElementById('insidebar-chatgpt-export-toolbar');

    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'insidebar-chatgpt-export-toolbar';
      document.body.appendChild(toolbar);
    }

    if (!document.getElementById('insidebar-save-conversation')) {
      saveButton = createSaveButton();
      toolbar.appendChild(saveButton);
    }

    ensureExportButtons(document.getElementById('insidebar-save-conversation'));
  }

  // Detect if there's a conversation on the page
  function detectConversation() {
    // Look for conversation container
    const conversationContainer = document.querySelector('main [class*="react-scroll-to-bottom"]') ||
                                   document.querySelector('main [role="presentation"]') ||
                                   document.querySelector('main');

    if (!conversationContainer) return false;

    // Look for messages
    const messages = getMessages();
    return messages && messages.length > 0;
  }

  // Observe DOM for share button appearance and conversation changes
  function observeForShareButton() {
    const observer = new MutationObserver(() => {
      // Try to insert button if it doesn't exist
      insertSaveButton();

      // Remove injected controls when navigating away from conversation pages.
      const existingButton = document.getElementById('insidebar-save-conversation');
      if (existingButton && !isChatGPTConversationPage()) {
        existingButton.remove();
        removeFallbackToolbar();
        saveButton = null;
      }
    });

    // Observe the entire document for changes
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Extract conversation title
  function getConversationTitle(messages = []) {
    // Priority 1: Extract conversation ID from URL and find matching sidebar link
    const urlMatch = window.location.pathname.match(/\/c\/([^\/]+)/);

    if (urlMatch) {
      const conversationId = urlMatch[1];
      const historyList = document.getElementById('history');

      if (historyList) {
        console.log('[ChatGPT Extractor] Found #history list, looking for conversation ID:', conversationId);

        // Find the sidebar link that matches this conversation ID
        const matchingLink = historyList.querySelector(`a[href*="${conversationId}"]`);

        if (matchingLink) {
          const titleSpan = matchingLink.querySelector('span[dir="auto"]');
          if (titleSpan) {
            const title = titleSpan.textContent.trim();
            if (title && !title.includes('New chat') && title.length > 0) {
              console.log('[ChatGPT Extractor] Found title from URL-matched sidebar link:', title);
              return title;
            }
          }

          // Fallback: use the entire link text content
          const title = matchingLink.textContent.trim();
          if (title && !title.includes('New chat') && title.length > 0) {
            console.log('[ChatGPT Extractor] Found title from URL-matched link (fallback):', title);
            return title;
          }
        }
      }
    }

    // Priority 2: Try to get active conversation using data-active attribute
    const historyList = document.getElementById('history');

    if (historyList) {
      console.log('[ChatGPT Extractor] Found #history list, looking for active item...');

      // Look for the active item with data-active attribute
      const activeItem = historyList.querySelector('[data-active]');

      if (activeItem) {
        // Find the span with the title text inside the active item
        const titleSpan = activeItem.querySelector('span[dir="auto"]');
        if (titleSpan) {
          const title = titleSpan.textContent.trim();
          if (title && !title.includes('New chat') && title.length > 0) {
            console.log('[ChatGPT Extractor] Found title from active item ([data-active] fallback):', title);
            return title;
          }
        }

        // Fallback: use the entire text content
        const title = activeItem.textContent.trim();
        if (title && !title.includes('New chat') && title.length > 0) {
          console.log('[ChatGPT Extractor] Found title from active item (content fallback):', title);
          return title;
        }
      } else {
        console.log('[ChatGPT Extractor] No [data-active] item found in #history');
      }
    } else {
      console.log('[ChatGPT Extractor] #history list not found');
    }

    // Priority 3: Try other selectors
    const fallbackSelectors = [
      'nav [aria-current="page"]',
      'h1',
      '[data-testid="conversation-title"]',
      'nav button[class*="font-semibold"]',
      'nav button > div'
    ];

    for (const selector of fallbackSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        console.log('[ChatGPT Extractor] Found title from fallback selector:', element.textContent.trim());
        return element.textContent.trim();
      }
    }

    // Ultimate fallback: generate a short local title from the first question.
    const generatedTitle = generateTitleFromMessages(messages.length ? messages : getMessages());
    if (generatedTitle) {
      console.log('[ChatGPT Extractor] Generated title from conversation content:', generatedTitle);
      return generatedTitle;
    }

    console.log('[ChatGPT Extractor] No title found, using default');
    return 'Untitled Conversation';
  }

  function generateTitleFromMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return '';

    const sourceMessage =
      messages.find(message => message.role === 'user' && message.content) ||
      messages.find(message => message.content);

    if (!sourceMessage) return '';

    return summarizeTextAsTitle(sourceMessage.content);
  }

  function summarizeTextAsTitle(text) {
    if (!text) return '';

    const cleaned = text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[#>*_\-[\]()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return '';

    const sentence = cleaned.split(/[。！？!?；;：:\n]/).find(part => part.trim()) || cleaned;
    const title = sentence.trim().slice(0, 30).trim();

    return title || '';
  }

  // Extract all messages from the conversation
  function getMessages() {
    const messages = [];

    const messageContainers = getMessageContainers();

    messageContainers.forEach(container => {
      try {
        const message = extractMessageFromContainer(container);
        if (message) {
          messages.push(message);
        }
      } catch (error) {
        console.warn('[ChatGPT Extractor] Error extracting message:', error);
      }
    });

    return messages;
  }

  function getMessageContainers() {
    const selectors = [
      '[data-testid^="conversation-turn-"]',
      '[class*="group/conversation-turn"]',
      '[data-message-author-role]',
      'main [class*="flex"][class*="gap"]'
    ];

    for (const selector of selectors) {
      const containers = document.querySelectorAll(selector);
      if (containers.length > 0) {
        console.log('[ChatGPT Extractor] Message containers found via selector:', selector, containers.length);
        return containers;
      }
    }

    return [];
  }

  // Extract a single message from its container
  function extractMessageFromContainer(container) {
    // Determine role (user or assistant)
    let role = 'unknown';

    const roleAttr = container.getAttribute('data-message-author-role');
    if (roleAttr) {
      role = roleAttr;
    } else {
      const nestedRoleElement = container.querySelector('[data-message-author-role]');
      const nestedRole = nestedRoleElement?.getAttribute('data-message-author-role');
      if (nestedRole) {
        role = nestedRole;
      }

      // Try to detect based on structure/classes
      const classes = container.className;
      if (role === 'unknown' && (classes.includes('user') || container.querySelector('[class*="user"]'))) {
        role = 'user';
      } else if (role === 'unknown' && (classes.includes('assistant') || container.querySelector('[class*="assistant"]'))) {
        role = 'assistant';
      }

      if (role === 'unknown') {
        if (container.querySelector('[class*="markdown"]')) {
          role = 'assistant';
        } else if (container.querySelector('[class*="whitespace-pre-wrap"]') || container.querySelector('[class*="whitespace"]')) {
          role = 'user';
        }
      }
    }

    // Get message content
    const contentElement = findMessageContentElement(container, role);

    if (!contentElement) return null;

    // Extract text content, preserving code blocks
    const content = extractContentWithFormatting(contentElement);
    const sources = role === 'assistant'
      ? extractSourcesFromElement(contentElement, container)
      : [];

    if (!content.trim()) return null;

    return {
      role,
      content: content.trim(),
      sources
    };
  }

  function extractSourcesFromElement(contentElement, container) {
    const sourceRoot = container || contentElement;
    const links = Array.from(sourceRoot.querySelectorAll('a[href]'));
    const seen = new Set();
    const sources = [];

    links.forEach(link => {
      const source = normalizeSourceLink(link);
      if (!source || seen.has(source.url)) return;

      seen.add(source.url);
      sources.push(source);
    });

    return sources;
  }

  function normalizeSourceLink(link) {
    const normalizedUrl = normalizeCitationUrl(link.getAttribute('href') || link.href);
    if (!normalizedUrl) return null;

    const url = new URL(normalizedUrl);
    const currentUrl = new URL(window.location.href);
    if (url.origin === currentUrl.origin && url.pathname === currentUrl.pathname) {
      return null;
    }

    const title = [
      link.textContent,
      link.getAttribute('aria-label'),
      link.getAttribute('title'),
      url.hostname
    ].find(value => value && value.trim())?.trim();

    return {
      title: sanitizeSourceTitle(title || url.hostname),
      url: normalizedUrl
    };
  }

  function sanitizeSourceTitle(title) {
    return title
      .replace(/\s+/g, ' ')
      .replace(/^\[\d+\]\s*/, '')
      .trim()
      .slice(0, 120);
  }

  function findMessageContentElement(container, role) {
    const roleRoot = container.matches?.('[data-message-author-role]')
      ? container
      : container.querySelector(`[data-message-author-role="${role}"]`);

    if (role === 'user') {
      return roleRoot?.querySelector('[class*="whitespace-pre-wrap"]') ||
        roleRoot?.querySelector('[class*="whitespace"]') ||
        container.querySelector('[class*="whitespace-pre-wrap"]') ||
        container.querySelector('[class*="whitespace"]') ||
        roleRoot ||
        container;
    }

    if (role === 'assistant') {
      return roleRoot?.querySelector('[class*="markdown"]') ||
        container.querySelector('[class*="markdown"]') ||
        roleRoot?.querySelector('[data-message-id]') ||
        container.querySelector('[data-message-id]') ||
        roleRoot ||
        container;
    }

    return container.querySelector('[class*="markdown"]') ||
      container.querySelector('[class*="whitespace-pre-wrap"]') ||
      container.querySelector('[data-message-id]') ||
      container;
  }

  // Extract content while preserving markdown formatting
  function extractContentWithFormatting(element) {
    // Clone the element so we don't modify the original DOM
    const clone = element.cloneNode(true);

    return extractMarkdownFromElement(clone);
  }

  // NOTE: Markdown extraction and formatting functions moved to conversation-extractor-utils.js

  // Extract full conversation data
  function extractConversation() {
    try {
      const messages = getMessages();
      const title = getConversationTitle(messages);

      if (!messages || messages.length === 0) {
        throw new Error('No messages found in conversation');
      }

      const content = formatMessagesAsText(messages);
      const citations = extractChatGPTCitations(messages);
      const lastUserMessage = [...messages].reverse().find(message => message.role === 'user');
      const assistantMessages = messages.filter(message => message.role === 'assistant');
      const answerMarkdown = assistantMessages.map(message => message.content).join('\n\n');

      return {
        title,
        content,
        messages,
        type: 'geo_run',
        query: lastUserMessage?.content || title,
        answerText: answerMarkdown,
        answerMarkdown,
        citations,
        rawEvidence: {
          visibleText: document.body.innerText?.slice(0, 5000) || '',
          linkCount: document.querySelectorAll('a[href]').length,
          sourcePanelDetected: Boolean(document.querySelector('[data-testid*="source"], [class*="source"], [aria-label*="Source"]'))
        },
        timestamp: Date.now(),
        url: window.location.href,
        provider: 'ChatGPT'
      };
    } catch (error) {
      console.error('[ChatGPT Extractor] Error extracting conversation:', error);
      throw error;
    }
  }

  function extractChatGPTCitations(messages = []) {
    const messageSources = messages
      .filter(message => message.role === 'assistant')
      .flatMap(message => message.sources || [])
      .map((source, index) => {
        const url = normalizeCitationUrl(source.url);
        if (!url) return null;

        let domain = '';
        try {
          domain = new URL(url).hostname.replace(/^www\./, '');
        } catch (error) {
          return null;
        }

        return {
          url,
          domain,
          title: source.title || domain,
          anchorText: source.title || domain,
          position: index + 1,
          sourceRole: 'third_party',
          isTargetDomain: false,
          isCompetitorDomain: false
        };
      })
      .filter(Boolean);

    return dedupeCitations([
      ...messageSources,
      ...extractInlineCitationLinks(),
      ...extractCitationCards(document)
    ]);
  }

  function extractInlineCitationLinks() {
    const roots = getMessageContainers()
      .map(container => container.querySelector('[class*="markdown"]') || container)
      .filter(Boolean);

    return dedupeCitations(roots.flatMap(root => extractExternalLinks(root)));
  }

  // Export the current ChatGPT conversation directly from the page.
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function sanitizeFilename(name) {
    return (name || 'chatgpt-conversation')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
  }

  function getBestScrollElement() {
    const candidates = [
      document.querySelector('main [class*="react-scroll-to-bottom"]'),
      document.querySelector('main'),
      document.scrollingElement,
      document.documentElement,
      document.body
    ].filter(Boolean);

    return candidates.find(el => {
      return el.scrollHeight && el.clientHeight && el.scrollHeight > el.clientHeight + 100;
    }) || document.scrollingElement || document.documentElement;
  }

  function setScrollTop(el, top) {
    if (
      el === document.scrollingElement ||
      el === document.documentElement ||
      el === document.body
    ) {
      window.scrollTo(0, top);
    } else {
      el.scrollTop = top;
    }
  }

  function getScrollHeight(el) {
    if (
      el === document.scrollingElement ||
      el === document.documentElement ||
      el === document.body
    ) {
      return Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
    }

    return el.scrollHeight;
  }

  function getClientHeight(el) {
    if (
      el === document.scrollingElement ||
      el === document.documentElement ||
      el === document.body
    ) {
      return window.innerHeight;
    }

    return el.clientHeight;
  }

  function messageKey(message) {
    return [
      message.role,
      message.content.length,
      message.content.slice(0, 120),
      message.content.slice(-120)
    ].join('::');
  }

  async function collectMessagesAcrossScroll() {
    const scrollEl = getBestScrollElement();
    const totalHeight = getScrollHeight(scrollEl);
    const viewportHeight = getClientHeight(scrollEl);
    const step = Math.max(500, Math.floor(viewportHeight * 0.75));

    const seen = new Set();
    const collectedByKey = new Map();
    const collected = [];

    for (let y = 0; y <= totalHeight + step; y += step) {
      setScrollTop(scrollEl, Math.min(y, totalHeight));
      await sleep(350);

      const batch = getMessages();

      for (const message of batch) {
        if (!message || !message.content) continue;

        const key = messageKey(message);

        if (!seen.has(key)) {
          seen.add(key);
          collectedByKey.set(key, message);
          collected.push(message);
        } else {
          mergeMessageMetadata(collectedByKey.get(key), message);
        }
      }
    }

    setScrollTop(scrollEl, totalHeight);

    return collected.length > 0 ? collected : getMessages();
  }

  function mergeMessageMetadata(targetMessage, sourceMessage) {
    if (!targetMessage || !sourceMessage) return;

    if (sourceMessage.sources && sourceMessage.sources.length > 0) {
      targetMessage.sources = mergeSources(targetMessage.sources || [], sourceMessage.sources);
    }
  }

  async function extractConversationForExport() {
    const messages = await collectMessagesAcrossScroll();

    if (!messages || messages.length === 0) {
      throw new Error('No messages found in conversation');
    }

    const title = getConversationTitle(messages);
    const content = formatMessagesAsText(messages);

    return {
      title,
      content,
      messages,
      message_count: messages.length,
      timestamp: Date.now(),
      exported_at: new Date().toISOString(),
      url: window.location.href,
      provider: 'ChatGPT',
      exporter: 'insidebar-ai-custom-local-exporter'
    };
  }

  function conversationToMarkdown(conversation) {
    const lines = [];
    const turns = buildConversationTurns(conversation.messages || []);

    lines.push(`# ${conversation.title || 'Untitled Conversation'}`);
    lines.push('');
    lines.push(`- Provider: ${conversation.provider || 'ChatGPT'}`);
    lines.push(`- Source URL: ${conversation.url || window.location.href}`);
    lines.push(`- Exported At: ${conversation.exported_at || new Date().toISOString()}`);
    lines.push(`- Message Count: ${conversation.message_count || conversation.messages.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    if (turns.length > 0) {
      turns.forEach((turn, index) => {
        lines.push(`## 第 ${index + 1} 轮`);
        lines.push('');

        if (turn.question) {
          lines.push('### 问');
          lines.push('');
          lines.push(turn.question);
          lines.push('');
        }

        if (turn.answer) {
          lines.push('### 答');
          lines.push('');
          lines.push(turn.answer);
          lines.push('');
        }

        if (turn.sources.length > 0) {
          lines.push('### 参考来源');
          lines.push('');
          turn.sources.forEach((source, sourceIndex) => {
            lines.push(`${sourceIndex + 1}. [${source.title}](${source.url})`);
          });
          lines.push('');
        }
      });

      return lines.join('\n');
    }

    conversation.messages.forEach((message, index) => {
      const roleLabel = message.role === 'assistant' ? 'ChatGPT' : message.role || 'Unknown';

      lines.push(`## ${index + 1}. ${roleLabel}`);
      lines.push('');
      lines.push(message.content || '');
      lines.push('');
    });

    return lines.join('\n');
  }

  function buildConversationTurns(messages) {
    const turns = [];
    let currentTurn = null;

    messages.forEach(message => {
      if (!message || !message.content) return;

      if (message.role === 'user') {
        currentTurn = {
          question: message.content,
          answer: '',
          sources: []
        };
        turns.push(currentTurn);
        return;
      }

      if (message.role === 'assistant') {
        if (!currentTurn) {
          currentTurn = {
            question: '',
            answer: '',
            sources: []
          };
          turns.push(currentTurn);
        }

        currentTurn.answer = currentTurn.answer
          ? `${currentTurn.answer}\n\n${message.content}`
          : message.content;
        currentTurn.sources = mergeSources(currentTurn.sources, message.sources || []);
      }
    });

    return turns.filter(turn => turn.question || turn.answer);
  }

  function mergeSources(existingSources, newSources) {
    const merged = [...existingSources];
    const seen = new Set(merged.map(source => source.url));

    newSources.forEach(source => {
      if (!source || !source.url || seen.has(source.url)) return;

      seen.add(source.url);
      merged.push(source);
    });

    return merged;
  }

  function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], {
      type: `${mimeType};charset=utf-8`
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = filename;
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  }

  async function handleExportClick(e, format) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    try {
      showNotification(`Exporting ${format.toUpperCase()}... Long conversations may take a few seconds.`, 'info');

      const conversation = await extractConversationForExport();
      const date = new Date().toISOString().slice(0, 10);
      const baseName = `${sanitizeFilename(conversation.title)}-${date}`;

      if (format === 'json') {
        downloadTextFile(
          `${baseName}.json`,
          JSON.stringify(conversation, null, 2),
          'application/json'
        );

        showNotification('JSON downloaded', 'success');
        return;
      }

      const markdown = conversationToMarkdown(conversation);

      downloadTextFile(
        `${baseName}.md`,
        markdown,
        'text/markdown'
      );

      showNotification('Markdown downloaded', 'success');
    } catch (error) {
      console.error('[ChatGPT Exporter] Export failed:', error);
      showNotification('Export failed: ' + error.message, 'error');
    }
  }

  function createExportButton(format) {
    const button = document.createElement('button');

    button.id = format === 'json'
      ? 'insidebar-export-json'
      : 'insidebar-export-markdown';

    button.className = 'btn relative btn-ghost text-token-text-primary mx-2';
    button.title = format === 'json'
      ? 'Download this conversation as JSON'
      : 'Download this conversation as Markdown';
    button.setAttribute('aria-label', button.title);

    const label = document.createElement('div');
    label.className = 'flex w-full items-center justify-center gap-1.5';
    label.textContent = format === 'json' ? '下载JSON' : '下载MD';
    button.appendChild(label);

    button.addEventListener('click', (e) => handleExportClick(e, format));

    return button;
  }

  function ensureExportButtons(anchorButton) {
    if (!anchorButton || !anchorButton.parentElement) return;

    let lastButton = anchorButton;

    if (!document.getElementById('insidebar-export-markdown')) {
      const mdButton = createExportButton('md');
      lastButton.after(mdButton);
      lastButton = mdButton;
    } else {
      lastButton = document.getElementById('insidebar-export-markdown');
    }

    if (!document.getElementById('insidebar-export-json')) {
      const jsonButton = createExportButton('json');
      lastButton.after(jsonButton);
    }
  }

  function removeExportButtons() {
    document.getElementById('insidebar-export-markdown')?.remove();
    document.getElementById('insidebar-export-json')?.remove();
  }

  function removeFallbackToolbar() {
    removeExportButtons();
    const toolbar = document.getElementById('insidebar-chatgpt-export-toolbar');
    toolbar?.remove();
  }

  // Handle save button click
  async function handleSaveClick(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    console.log('[ChatGPT Extractor] Save button clicked');
    console.log('[ChatGPT Extractor] chrome object exists?', typeof chrome !== 'undefined');
    console.log('[ChatGPT Extractor] chrome.runtime exists?', typeof chrome?.runtime !== 'undefined');

    if (!saveButton) return;

    // Check if chrome API is available
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      console.error('[ChatGPT Extractor] Chrome extension API not available');
      showNotification('Extension API not available. Try reloading the page.', 'error');
      return;
    }

    // Disable button during save
    saveButton.disabled = true;
    const originalHTML = saveButton.innerHTML;
    saveButton.innerHTML = '<div class="flex w-full items-center justify-center gap-1.5"><span>Saving...</span></div>';

    try {
      const conversation = extractConversation();
      console.log('[ChatGPT Extractor] Extracted conversation:', {
        title: conversation.title,
        messageCount: conversation.messages.length,
        contentLength: conversation.content.length,
        url: conversation.url,
        provider: conversation.provider
      });

      // Generate conversation ID for deduplication
      const conversationId = generateConversationId(conversation.url, conversation.title);
      conversation.conversationId = conversationId;

      console.log('[ChatGPT Extractor] Generated conversation ID:', conversationId);

      // Check for duplicates
      const duplicateCheck = await checkForDuplicate(conversationId);
      console.log('[ChatGPT Extractor] Duplicate check result:', duplicateCheck);

      if (duplicateCheck.isDuplicate) {
        console.log('[ChatGPT Extractor] Duplicate found, comparing content...');

        // Compare content to decide whether to save
        const existingContent = (duplicateCheck.existingConversation.content || '').trim();
        const newContent = (conversation.content || '').trim();

        if (existingContent === newContent) {
          // Content identical - silently skip save
          console.log('[ChatGPT Extractor] Content identical, skipping save');
          saveButton.disabled = false;
          saveButton.innerHTML = originalHTML;
          return;
        }

        // Content changed - automatically overwrite with original timestamp
        console.log('[ChatGPT Extractor] Content changed, will overwrite with original timestamp');
        conversation.overwriteId = duplicateCheck.existingConversation.id;
        conversation.timestamp = duplicateCheck.existingConversation.timestamp;
      }

      // Send to background script
      chrome.runtime.sendMessage({
        action: 'saveConversationFromPage',
        payload: conversation
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[ChatGPT Extractor] Chrome runtime error:', chrome.runtime.lastError);
          const errorMsg = chrome.runtime.lastError.message;

          // Provide user-friendly message for context invalidation
          if (errorMsg.includes('Extension context invalidated')) {
            showNotification('Extension was reloaded. Please reload this page and try saving again.', 'error');
          } else {
            showNotification('Failed to save: ' + errorMsg, 'error');
          }
          saveButton.disabled = false;
          saveButton.innerHTML = originalHTML;
          return;
        }

        console.log('[ChatGPT Extractor] Response from background:', response);

        if (response && response.success) {
          console.log('[ChatGPT Extractor] Conversation saved successfully');
          // Success notification now shown in sidebar
        } else {
          console.error('[ChatGPT Extractor] Save failed. Response:', response);
          const errorMsg = response?.error || 'Unknown error';
          showNotification('Failed to save: ' + errorMsg, 'error');
        }

        // Re-enable button
        saveButton.disabled = false;
        saveButton.innerHTML = originalHTML;
      });
    } catch (error) {
      console.error('[ChatGPT Extractor] Error during extraction:', error);
      console.error('[ChatGPT Extractor] Error stack:', error.stack);
      showNotification('Failed to extract conversation: ' + error.message, 'error');

      // Re-enable button
      saveButton.disabled = false;
      saveButton.innerHTML = originalHTML;
    }
  }

  // Setup keyboard shortcut (Ctrl+Shift+S or Cmd+Shift+S)
  if (window.__INSIDEBAR_CHATGPT_EXTRACTOR_TEST__) {
    window.__InsidebarChatGPTExtractorTest = {
      conversationToMarkdown,
      extractConversationForExport,
      getMessages,
      getMessageContainers,
      handleExportClick,
      insertSaveButton
    };
  }

  setupKeyboardShortcut(handleSaveClick, detectConversation);

})();
