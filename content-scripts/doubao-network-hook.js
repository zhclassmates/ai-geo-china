(() => {
  if (window.__AI_GEO_DOUBAO_NETWORK_HOOKED__) return;
  window.__AI_GEO_DOUBAO_NETWORK_HOOKED__ = true;

  const MAX_TEXT_LENGTH = 5000000;
  let activeRun = null;

  window.addEventListener('message', event => {
    if (event.source !== window) return;

    const message = event.data;
    if (message?.source !== 'AI_GEO_RUN_BINDING' || message.type !== 'doubao_run_started') return;

    activeRun = normalizeRunContext(message.payload);
  });

  function normalizeRunContext(run) {
    if (!run || run.provider !== 'doubao' || !run.runId) return null;

    return {
      runId: String(run.runId),
      provider: 'doubao',
      prompt: String(run.prompt || ''),
      promptHash: String(run.promptHash || ''),
      startedAt: Number(run.startedAt || Date.now()),
      conversationUrl: String(run.conversationUrl || location.href),
      status: run.status || 'running'
    };
  }

  function shouldCaptureText(text) {
    if (!text || typeof text !== 'string') return false;

    return (
      text.includes('search_query_result_block') ||
      text.includes('text_card') ||
      text.includes('main_site_url') ||
      text.includes('content_block') ||
      text.includes('参考资料') ||
      text.includes('引用')
    );
  }

  function postCapturedResponse(payload) {
    try {
      window.postMessage({
        source: 'AI_GEO_DOUBAO_NETWORK_HOOK',
        type: 'doubao_response_text',
        payload
      }, '*');
    } catch (error) {
      console.warn('[AI GEO] post captured response failed:', error);
    }
  }

  function captureResponseText(url, text, transport) {
    if (!shouldCaptureText(text)) return;

    const ids = extractRequestIds(url);
    postCapturedResponse({
      url: String(url || ''),
      transport,
      text: text.slice(0, MAX_TEXT_LENGTH),
      capturedAt: Date.now(),
      provider: 'doubao',
      runId: activeRun?.runId || '',
      promptHash: activeRun?.promptHash || '',
      runStartedAt: activeRun?.startedAt || null,
      conversationUrl: activeRun?.conversationUrl || location.href,
      conversationId: ids.conversationId,
      messageId: ids.messageId,
      requestId: ids.requestId
    });
  }

  function extractRequestIds(rawUrl) {
    const ids = {
      conversationId: '',
      messageId: '',
      requestId: ''
    };

    try {
      const parsed = new URL(rawUrl || '', location.href);
      ids.conversationId = [
        'conversation_id',
        'conversationId',
        'conv_id',
        'chat_id'
      ].map(key => parsed.searchParams.get(key)).find(Boolean) || '';
      ids.messageId = [
        'message_id',
        'messageId',
        'msg_id'
      ].map(key => parsed.searchParams.get(key)).find(Boolean) || '';
      ids.requestId = [
        'req_id',
        'request_id',
        'requestId',
        'logid'
      ].map(key => parsed.searchParams.get(key)).find(Boolean) || '';
    } catch (error) {
      // Keep blank ids when URL parsing fails.
    }

    return ids;
  }

  const originalFetch = window.fetch;

  if (typeof originalFetch === 'function') {
    window.fetch = async function patchedFetch(...args) {
      const response = await originalFetch.apply(this, args);

      try {
        const request = args[0];
        const url = typeof request === 'string' ? request : request?.url;
        const clone = response.clone();
        const contentType = clone.headers.get('content-type') || '';

        if (
          contentType.includes('json') ||
          contentType.includes('text') ||
          contentType.includes('event-stream') ||
          contentType.includes('octet-stream') ||
          !contentType
        ) {
          clone.text()
            .then(text => {
              captureResponseText(url, text, 'fetch');
            })
            .catch(() => {});
        }
      } catch (error) {
        console.warn('[AI GEO] fetch capture failed:', error);
      }

      return response;
    };
  }

  const OriginalXHR = window.XMLHttpRequest;

  if (typeof OriginalXHR === 'function') {
    window.XMLHttpRequest = function PatchedXMLHttpRequest() {
      const xhr = new OriginalXHR();
      let requestUrl = '';

      const originalOpen = xhr.open;
      xhr.open = function patchedOpen(method, url, ...rest) {
        requestUrl = String(url || '');
        return originalOpen.call(this, method, url, ...rest);
      };

      xhr.addEventListener('load', function handleLoad() {
        try {
          captureResponseText(requestUrl, xhr.responseText, 'xhr');
        } catch (error) {
          // Some responseType values block responseText access.
        }
      });

      return xhr;
    };

    window.XMLHttpRequest.prototype = OriginalXHR.prototype;
    Object.setPrototypeOf(window.XMLHttpRequest, OriginalXHR);
  }

  window.postMessage({
    source: 'AI_GEO_DOUBAO_NETWORK_HOOK',
    type: 'hook_ready',
    payload: {
      readyAt: Date.now(),
      href: location.href
    }
  }, '*');
})();
