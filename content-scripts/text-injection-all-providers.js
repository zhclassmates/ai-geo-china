// Text injection handler for Doubao
// Self-contained script without module imports (for iframe compatibility)

(function() {
  'use strict';

  // Provider-specific selectors
  const PROVIDER_SELECTORS = {
    doubao: ['textarea', '[contenteditable="true"]', '.ProseMirror', '[role="textbox"]']
  };

  // Detect which provider we're on based on hostname
  function detectProvider() {
    const hostname = window.location.hostname;
    if (hostname.includes('doubao.com')) {
      return 'doubao';
    }
    return null;
  }

  function rememberLastProduct(provider, text, runContext = null) {
    const product = text.trim();
    if (!product) return;

    const run = normalizeRunContext(provider, product, runContext);
    const payload = JSON.stringify({
      provider,
      product,
      timestamp: Date.now(),
      url: window.location.href,
      runId: run.runId,
      promptHash: run.promptHash,
      startedAt: run.startedAt
    });

    try {
      sessionStorage.setItem('insidebarLastProduct', payload);
      localStorage.setItem('insidebarLastProduct', payload);
      sessionStorage.setItem('insidebarActiveDoubaoRun', JSON.stringify(run));
      localStorage.setItem('insidebarActiveDoubaoRun', JSON.stringify(run));
    } catch (error) {
      window.__insidebarLastProduct = payload;
      window.__insidebarActiveDoubaoRun = run;
    }

    broadcastRunStart(run);
  }

  function normalizeRunContext(provider, prompt, runContext) {
    const startedAt = Number(runContext?.startedAt || Date.now());

    return {
      runId: String(runContext?.runId || crypto.randomUUID()),
      provider,
      prompt,
      promptHash: String(runContext?.promptHash || hashPrompt(prompt)),
      startedAt,
      conversationUrl: window.location.href,
      status: 'running'
    };
  }

  function broadcastRunStart(run) {
    try {
      window.postMessage({
        source: 'AI_GEO_RUN_BINDING',
        type: 'doubao_run_started',
        payload: run
      }, '*');
    } catch (error) {
      console.warn('[Text Injection] Failed to broadcast run context:', error);
    }
  }

  function hashPrompt(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    let hash = 2166136261;

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  // Find text input element by selector
  function findTextInputElement(selector) {
    if (!selector || typeof selector !== 'string') {
      return null;
    }

    try {
      return document.querySelector(selector);
    } catch (error) {
      console.error('Error finding element:', error);
      return null;
    }
  }

  // Inject text into an element (textarea or contenteditable)
  function injectTextIntoElement(element, text) {
    if (!element || !text || typeof text !== 'string' || text.trim() === '') {
      return false;
    }

    try {
      const isTextarea = element.tagName === 'TEXTAREA' || element.tagName === 'INPUT';
      const isContentEditable = element.isContentEditable || element.getAttribute('contenteditable') === 'true';

      if (!isTextarea && !isContentEditable) {
        console.warn('Element is not a textarea or contenteditable:', element);
        return false;
      }

      if (isTextarea) {
        // For textarea/input elements
        const currentValue = element.value || '';
        const newValue = currentValue + text;

        // For React - use native setter to bypass React's control
        const prototype = element.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
        nativeInputValueSetter.call(element, newValue);

        // Trigger multiple events to notify React/Vue/etc
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        // Move cursor to end (without focusing to avoid cross-origin error)
        element.selectionStart = element.selectionEnd = element.value.length;
      } else {
        // For contenteditable elements
        const currentText = element.textContent || '';
        element.textContent = currentText + text;

        // Trigger input event
        element.dispatchEvent(new Event('input', { bubbles: true }));

        // Move cursor to end for contenteditable (without focusing)
        try {
          const range = document.createRange();
          const selection = window.getSelection();
          range.selectNodeContents(element);
          range.collapse(false); // Collapse to end
          selection.removeAllRanges();
          selection.addRange(range);
        } catch (e) {
          // Ignore selection errors in cross-origin context
        }
      }

      return true;
    } catch (error) {
      console.error('Error injecting text:', error);
      return false;
    }
  }

  // Handle text injection message
  function handleTextInjection(event) {
    // Validate event data structure
    if (!event || !event.data || typeof event.data !== 'object') {
      return;
    }

    // Only handle INJECT_TEXT messages
    if (event.data.type !== 'INJECT_TEXT') {
      return;
    }

    // Validate text payload
    const text = event.data.text;
    const runContext = event.data.geoRun || null;
    if (!text || typeof text !== 'string' || text.length === 0) {
      console.warn('[Text Injection] Invalid text payload');
      return;
    }

    // Sanity check: reject extremely large payloads (> 1MB)
    if (text.length > 1048576) {
      console.error('[Text Injection] Text payload too large:', text.length, 'bytes');
      return;
    }

    const provider = detectProvider();
    if (!provider) {
      console.warn('Unknown provider, cannot inject text');
      return;
    }

    const selectors = PROVIDER_SELECTORS[provider];
    if (!selectors) {
      console.warn('No selectors configured for provider:', provider);
      return;
    }

    // Try each selector until we find an element
    let element = null;
    for (const selector of selectors) {
      element = findTextInputElement(selector);
      if (element) break;
    }

    if (element) {
      const success = injectTextIntoElement(element, text);
      if (success) {
        rememberLastProduct(provider, text, runContext);
      }
      if (!success) {
        console.error(`[Text Injection] Failed to inject text into ${provider}`);
      }
    } else {
      // Retry after a short delay in case page is still loading
      setTimeout(() => {
        let retryElement = null;
        for (const selector of selectors) {
          retryElement = findTextInputElement(selector);
          if (retryElement) {
            break;
          }
        }
        if (retryElement) {
          if (injectTextIntoElement(retryElement, text)) {
            rememberLastProduct(provider, text, runContext);
          }
        } else {
          console.error(`[Text Injection] ${provider} editor not found`);
        }
      }, 1000);
    }
  }

  // Listen for messages from sidebar
  window.addEventListener('message', handleTextInjection);
})();
