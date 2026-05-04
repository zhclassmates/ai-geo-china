// Shared Utilities for Conversation Extractors
// Common functions used across all AI provider history extractors
// This module eliminates duplication across ChatGPT, Claude, Gemini, Grok, DeepSeek, and Perplexity extractors
//
// NOTE: This file must be loaded BEFORE any *-history-extractor.js files in manifest.json
// It exports functions to window.ConversationExtractorUtils

(function() {
  'use strict';

  // Create global namespace for shared utilities
  window.ConversationExtractorUtils = window.ConversationExtractorUtils || {};

  // ============================================================================
  // Markdown Extraction Functions
  // ============================================================================

  /**
   * Recursively extract markdown from DOM elements
   * Preserves formatting like code blocks, headings, lists, bold, italic, etc.
   * @param {Node} node - DOM node to extract from
   * @returns {string} Markdown-formatted text
   */
  window.ConversationExtractorUtils.extractMarkdownFromElement = function extractMarkdownFromElement(node) {
  if (!node) return '';

  // Text node - return text content
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }

  // Element node - convert to markdown based on tag type
  if (node.nodeType === Node.ELEMENT_NODE) {
    const tagName = node.tagName.toLowerCase();

    // Code blocks (highest priority)
    if (tagName === 'pre') {
      const codeElement = node.querySelector('code');
      if (codeElement) {
        const language = codeElement.className.match(/language-(\w+)/)?.[1] || '';
        const codeContent = codeElement.textContent;
        return language
          ? `\n\`\`\`${language}\n${codeContent}\n\`\`\`\n\n`
          : `\n\`\`\`\n${codeContent}\n\`\`\`\n\n`;
      }
      return `\n\`\`\`\n${node.textContent}\n\`\`\`\n\n`;
    }

    // Inline code
    if (tagName === 'code') {
      return `\`${node.textContent}\``;
    }

    // Headings
    if (tagName.match(/^h[1-6]$/)) {
      const level = tagName.charAt(1);
      const hashes = '#'.repeat(parseInt(level));
      return `\n${hashes} ${getChildrenText(node)}\n\n`;
    }

    // Bold/Strong
    if (tagName === 'strong' || tagName === 'b') {
      return `**${getChildrenText(node)}**`;
    }

    // Italic/Emphasis
    if (tagName === 'em' || tagName === 'i') {
      return `*${getChildrenText(node)}*`;
    }

    // Links
    if (tagName === 'a') {
      const href = node.getAttribute('href') || '';
      const text = getChildrenText(node);
      return `[${text}](${href})`;
    }

    // Lists
    if (tagName === 'ul') {
      let listText = '\n';
      Array.from(node.children).forEach(li => {
        if (li.tagName.toLowerCase() === 'li') {
          listText += `- ${extractMarkdownFromElement(li).trim()}\n`;
        }
      });
      return listText + '\n';
    }

    if (tagName === 'ol') {
      let listText = '\n';
      Array.from(node.children).forEach((li, index) => {
        if (li.tagName.toLowerCase() === 'li') {
          listText += `${index + 1}. ${extractMarkdownFromElement(li).trim()}\n`;
        }
      });
      return listText + '\n';
    }

    // Blockquotes
    if (tagName === 'blockquote') {
      const text = getChildrenText(node);
      return `\n> ${text}\n\n`;
    }

    // Line breaks
    if (tagName === 'br') {
      return '\n';
    }

    // Paragraphs
    if (tagName === 'p') {
      return `${getChildrenMarkdown(node)}\n\n`;
    }

    // Divs - just process children
    if (tagName === 'div') {
      return getChildrenMarkdown(node);
    }

    // Default: process children
    return getChildrenMarkdown(node);
  }

  return '';
  };

  /**
   * Helper to get plain text from all children (for simple formatting like headings, bold)
   * @param {Node} node - DOM node
   * @returns {string} Plain text
   */
  function getChildrenText(node) {
    return Array.from(node.childNodes)
      .map(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          return child.textContent;
        }
        return child.textContent || '';
      })
      .join('');
  }

  /**
   * Helper to get markdown from all children (for complex formatting)
   * @param {Node} node - DOM node
   * @returns {string} Markdown-formatted text
   */
  function getChildrenMarkdown(node) {
    return Array.from(node.childNodes)
      .map(child => window.ConversationExtractorUtils.extractMarkdownFromElement(child))
      .join('');
  }

  // ============================================================================
  // GEO Citation Extraction Functions
  // ============================================================================

  window.ConversationExtractorUtils.normalizeCitationUrl = function normalizeCitationUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';

    try {
      const url = new URL(rawUrl, window.location.href);

      if (!['http:', 'https:'].includes(url.protocol)) return '';

      const blockedHosts = [
        'chatgpt.com',
        'chat.openai.com',
        'claude.ai',
        'gemini.google.com',
        'grok.com',
        'chat.deepseek.com',
        'www.perplexity.ai',
        'perplexity.ai',
        'www.google.com',
        'google.com'
      ];
      const hostname = url.hostname.replace(/^www\./, '');

      if (blockedHosts.some(host => hostname === host.replace(/^www\./, ''))) {
        const realTarget = url.searchParams.get('url') ||
          url.searchParams.get('q') ||
          url.searchParams.get('u');

        if (realTarget && /^https?:\/\//i.test(realTarget)) {
          return window.ConversationExtractorUtils.normalizeCitationUrl(realTarget);
        }
      }

      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'fbclid', 'gclid'].forEach(param => {
        url.searchParams.delete(param);
      });
      url.hash = '';

      return url.href;
    } catch (error) {
      return '';
    }
  };

  window.ConversationExtractorUtils.isRealExternalUrl = function isRealExternalUrl(rawUrl) {
    const normalizedUrl = window.ConversationExtractorUtils.normalizeCitationUrl(rawUrl);
    if (!normalizedUrl) return false;

    try {
      const url = new URL(normalizedUrl);
      const current = new URL(window.location.href);
      const currentDomain = current.hostname.replace(/^www\./, '');
      const targetDomain = url.hostname.replace(/^www\./, '');

      if (targetDomain === currentDomain) return false;
      if (['accounts.google.com', 'support.google.com'].includes(targetDomain)) return false;

      return true;
    } catch (error) {
      return false;
    }
  };

  window.ConversationExtractorUtils.extractExternalLinks = function extractExternalLinks(root = document) {
    const anchors = Array.from(root.querySelectorAll('a[href]'));

    return anchors
      .map((anchor, index) => {
        const url = window.ConversationExtractorUtils.normalizeCitationUrl(anchor.href || anchor.getAttribute('href'));
        if (!url || !window.ConversationExtractorUtils.isRealExternalUrl(url)) return null;

        let domain = '';
        try {
          domain = new URL(url).hostname.replace(/^www\./, '');
        } catch (error) {
          return null;
        }

        const anchorText = [
          anchor.innerText,
          anchor.textContent,
          anchor.getAttribute('aria-label'),
          anchor.getAttribute('title')
        ].find(value => value && value.trim())?.replace(/\s+/g, ' ').trim() || domain;

        const card = anchor.closest('article, [role="article"], [data-testid*="source"], [class*="source"], [class*="citation"], [class*="card"]');
        const title = [
          card?.querySelector('h1,h2,h3,h4')?.textContent,
          anchor.getAttribute('aria-label'),
          anchor.getAttribute('title'),
          anchorText
        ].find(value => value && value.trim())?.replace(/\s+/g, ' ').trim() || domain;

        return {
          url,
          domain,
          title: title.slice(0, 160),
          anchorText: anchorText.slice(0, 240),
          position: index + 1,
          sourceType: window.ConversationExtractorUtils.classifySourceType(url, title, anchorText),
          sourceRole: 'third_party',
          isTargetDomain: false,
          isCompetitorDomain: false
        };
      })
      .filter(Boolean);
  };

  window.ConversationExtractorUtils.extractCitationCards = function extractCitationCards(root = document) {
    const cardSelectors = [
      '[data-testid*="source"]',
      '[data-testid*="citation"]',
      '[class*="source"]',
      '[class*="citation"]',
      '[aria-label*="Source"]',
      '[aria-label*="source"]'
    ];
    const cards = Array.from(root.querySelectorAll(cardSelectors.join(',')));

    return window.ConversationExtractorUtils.dedupeCitations(cards.flatMap(card => {
      const links = window.ConversationExtractorUtils.extractExternalLinks(card);
      const cardTitle = card.querySelector('h1,h2,h3,h4')?.textContent?.replace(/\s+/g, ' ').trim();

      return links.map(link => ({
        ...link,
        title: cardTitle || link.title,
        anchorText: link.anchorText || card.textContent?.replace(/\s+/g, ' ').trim().slice(0, 240) || link.domain
      }));
    }));
  };

  window.ConversationExtractorUtils.classifySourceType = function classifySourceType(url, title = '', text = '') {
    let hostname = '';
    try {
      hostname = new URL(url).hostname.replace(/^www\./, '');
    } catch (error) {
      return 'unknown';
    }

    const haystack = `${hostname} ${title} ${text}`.toLowerCase();

    if (/\.(edu|ac\.[a-z]{2})$/.test(hostname) || haystack.includes('university') || haystack.includes('大学')) {
      return 'university';
    }
    if (/\.(gov|gov\.[a-z]{2})$/.test(hostname) || haystack.includes('government') || haystack.includes('政府')) {
      return 'government';
    }
    if (/(reddit|quora|zhihu|stackexchange|forum|bbs|community)/.test(haystack)) {
      return 'forum';
    }
    if (/(amazon|shopify|etsy|ebay|taobao|tmall|jd\.com|marketplace)/.test(haystack)) {
      return 'marketplace';
    }
    if (/(review|reviews|best-|top-|compare|comparison|评测|测评|排行|榜单|对比)/.test(haystack)) {
      return 'review';
    }
    if (/(news|media|press|magazine|journal|blog|times|post|资讯|新闻|媒体)/.test(haystack)) {
      return 'media';
    }

    return 'official';
  };

  window.ConversationExtractorUtils.classifyCitation = function classifyCitation(citation, project = {}) {
    if (!citation || !citation.domain) return citation;

    const domain = citation.domain.replace(/^www\./, '').toLowerCase();
    const targetDomains = Array.isArray(project.domains) ? project.domains : [];
    const competitors = Array.isArray(project.competitors) ? project.competitors : [];

    citation.isTargetDomain = targetDomains.some(targetDomain => {
      const normalized = String(targetDomain).replace(/^www\./, '').toLowerCase();
      return normalized && (domain === normalized || domain.endsWith(`.${normalized}`));
    });

    citation.isCompetitorDomain = competitors.some(competitor => {
      const competitorDomains = Array.isArray(competitor.domains) ? competitor.domains : [];
      return competitorDomains.some(competitorDomain => {
        const normalized = String(competitorDomain).replace(/^www\./, '').toLowerCase();
        return normalized && (domain === normalized || domain.endsWith(`.${normalized}`));
      });
    });

    citation.sourceRole = citation.isTargetDomain
      ? 'target'
      : citation.isCompetitorDomain
        ? 'competitor'
        : 'third_party';

    return citation;
  };

  window.ConversationExtractorUtils.dedupeCitations = function dedupeCitations(citations = []) {
    const seen = new Set();
    const deduped = [];

    citations.forEach(citation => {
      if (!citation || !citation.url) return;

      const normalizedUrl = window.ConversationExtractorUtils.normalizeCitationUrl(citation.url);
      if (!normalizedUrl || seen.has(normalizedUrl)) return;

      seen.add(normalizedUrl);
      deduped.push({
        ...citation,
        url: normalizedUrl,
        position: deduped.length + 1
      });
    });

    return deduped;
  };

  // ============================================================================
  // Message Formatting Functions
  // ============================================================================

  /**
   * Format messages array as text with role labels
   * @param {Array} messages - Array of {role, content} objects
   * @returns {string} Formatted text
   */
  window.ConversationExtractorUtils.formatMessagesAsText = function(messages) {
    return messages.map(msg => {
      const roleLabel = msg.role === 'user' ? 'User' :
                       msg.role === 'assistant' ? 'Assistant' :
                       msg.role.charAt(0).toUpperCase() + msg.role.slice(1);

      return `${roleLabel}:\n${msg.content}`;
    }).join('\n\n---\n\n');
  };

  // ============================================================================
  // Conversation ID and Duplication Functions
  // ============================================================================

  /**
   * Generate a unique conversation ID from URL or title hash
   * Uses the full URL as the primary identifier for deduplication
   * @param {string} url - Conversation URL (if available)
   * @param {string} title - Conversation title
   * @returns {string} Unique conversation ID
   */
  window.ConversationExtractorUtils.generateConversationId = function(url, title) {
  // Prefer URL-based ID for uniqueness and reliability
  if (url) {
    // Google AI Mode: Use normalized query parameter only
    if (url.includes('google.com/search') && url.includes('udm=50')) {
      try {
        const urlObj = new URL(url);
        const query = urlObj.searchParams.get('q');
        if (query) {
          // Normalize query: lowercase, trim, collapse spaces
          const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
          return `google-ai-${normalized}`;
        }
      } catch (e) {
        console.error('[Extractor Utils] Error parsing Google AI URL:', e);
      }
    }

    // Extract conversation ID from URL if present
    // ChatGPT: https://chatgpt.com/c/abc123
    // Claude: https://claude.ai/chat/abc-123
    const urlMatch = url.match(/\/(c|chat)\/([a-zA-Z0-9-]+)/);
    if (urlMatch) {
      return urlMatch[2];
    }
    // Use full URL as fallback
    return url;
  }

  // Fallback: Create ID from title + timestamp
  // This won't catch duplicates effectively, but prevents collisions
  return `${title}_${Date.now()}`;
  };

  /**
   * Check if a conversation already exists with this ID
   * @param {string} conversationId - The conversation ID to check
   * @returns {Promise<Object>} {isDuplicate: boolean, existingConversation: Object|null}
   */
  window.ConversationExtractorUtils.checkForDuplicate = async function(conversationId) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'checkDuplicateConversation',
      payload: { conversationId }
    });

    return response;
  } catch (error) {
    console.error('[Extractor Utils] Error checking for duplicate:', error);
    // Re-throw error to let caller handle it appropriately
    // With direct database access in service worker, this should not fail
    throw new Error(`Failed to check for duplicate: ${error.message}`);
  }
  };

  /**
   * Show duplicate warning modal and get user choice
   * @param {string} title - Conversation title
   * @param {Object} existingConversation - The existing conversation data
   * @returns {Promise<string>} User choice: 'cancel' or 'overwrite'
   */
  window.ConversationExtractorUtils.showDuplicateWarning = function(title, existingConversation) {
  return new Promise((resolve) => {
    // Create modal
    const modal = document.createElement('div');
    modal.id = 'insidebar-duplicate-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-center;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const existingDate = existingConversation?.timestamp
      ? new Date(existingConversation.timestamp).toLocaleString()
      : 'Unknown date';

    modal.innerHTML = `
      <div style="
        background: white;
        color: #333;
        border-radius: 12px;
        padding: 24px;
        max-width: 480px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      ">
        <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">
          ${chrome.i18n.getMessage('dlgDuplicateTitle')}
        </h3>
        <p style="margin: 0 0 8px 0; font-size: 14px; line-height: 1.5;">
          ${chrome.i18n.getMessage('dlgDuplicateDesc')}
        </p>
        <p style="margin: 0 0 16px 0; font-size: 13px; color: #666; font-weight: 500;">
          "${title}"<br>
          <span style="font-size: 12px;">${chrome.i18n.getMessage('dlgDuplicateSaved', [existingDate])}</span>
        </p>
        <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5;">
          ${chrome.i18n.getMessage('dlgDuplicateQuestion')}
        </p>
        <div style="display: flex; gap: 12px;">
          <button id="insidebar-dup-cancel" style="
            flex: 1;
            padding: 10px 16px;
            border: 1px solid #ddd;
            border-radius: 6px;
            background: white;
            color: #333;
            font-size: 14px;
            cursor: pointer;
            font-weight: 500;
          ">
            ${chrome.i18n.getMessage('btnCancel')}
          </button>
          <button id="insidebar-dup-overwrite" style="
            flex: 1;
            padding: 10px 16px;
            border: none;
            border-radius: 6px;
            background: #f59e0b;
            color: white;
            font-size: 14px;
            cursor: pointer;
            font-weight: 500;
          ">
            ${chrome.i18n.getMessage('btnOverwrite')}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Add event listeners
    const cleanup = (choice) => {
      modal.remove();
      resolve(choice);
    };

    document.getElementById('insidebar-dup-cancel').addEventListener('click', () => cleanup('cancel'));
    document.getElementById('insidebar-dup-overwrite').addEventListener('click', () => cleanup('overwrite'));

    // Close on outside click (same as cancel)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        cleanup('cancel');
      }
    });
  });
  };

  // ============================================================================
  // Notification Functions
  // ============================================================================

  /**
   * Show notification to user on the provider page
   * NOTE: Success notifications are now shown in sidebar instead
   * This is primarily for error notifications
   * @param {string} message - Message to display
   * @param {string} type - 'info', 'success', or 'error'
   */
  window.ConversationExtractorUtils.showNotification = function(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `insidebar-notification insidebar-notification-${type}`;
  notification.style.cssText = `
    position: fixed;
    top: 24px;
    right: 24px;
    background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    max-width: 400px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  `;
  notification.textContent = message;

  document.body.appendChild(notification);

  // Trigger animation
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(0)';
  }, 10);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
  };

  // ============================================================================
  // Keyboard Shortcut Function
  // ============================================================================

  /**
   * Setup keyboard shortcut for saving conversation
   * @param {Function} callback - Function to call when shortcut is pressed
   * @param {Function} shouldEnable - Optional function to check if shortcut should be enabled
   */
  window.ConversationExtractorUtils.setupKeyboardShortcut = function(callback, shouldEnable = null) {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
      e.preventDefault();

      // Check if shortcut should be enabled
      if (shouldEnable && !shouldEnable()) {
        return;
      }

      callback(e);
    }
  });
  };

  // ============================================================================
  // URL Change Observer (for SPAs)
  // ============================================================================

  /**
   * Observe URL changes for single-page applications
   * @param {Function} callback - Function to call when URL changes
   * @param {RegExp|string} urlPattern - Optional pattern to filter URLs
   * @returns {Function} Cleanup function to stop observing and clear resources
   */
  window.ConversationExtractorUtils.observeUrlChanges = function(callback, urlPattern = null) {
  let lastUrl = window.location.href;

  // Check URL periodically (SPAs often don't fire popstate)
  const intervalId = setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;

      // Check pattern if provided
      if (urlPattern) {
        if (typeof urlPattern === 'string') {
          if (currentUrl.includes(urlPattern)) {
            callback(currentUrl);
          }
        } else if (urlPattern instanceof RegExp) {
          if (urlPattern.test(currentUrl)) {
            callback(currentUrl);
          }
        }
      } else {
        callback(currentUrl);
      }
    }
  }, 1000);

  // Also listen for popstate (back/forward navigation)
  const popstateHandler = () => {
    callback(window.location.href);
  };
  window.addEventListener('popstate', popstateHandler);

  // Auto-cleanup on page unload
  const unloadHandler = () => {
    clearInterval(intervalId);
    window.removeEventListener('popstate', popstateHandler);
  };
  window.addEventListener('beforeunload', unloadHandler);

  // Return cleanup function
  return function cleanup() {
    clearInterval(intervalId);
    window.removeEventListener('popstate', popstateHandler);
    window.removeEventListener('beforeunload', unloadHandler);
  };
  };

})();
