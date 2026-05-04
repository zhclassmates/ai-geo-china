import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

function loadChatGPTExtractor() {
  window.__INSIDEBAR_CHATGPT_EXTRACTOR_SKIP_AUTO_INIT__ = true;
  window.__INSIDEBAR_CHATGPT_EXTRACTOR_TEST__ = true;

  window.LanguageDetector = {
    getSaveButtonText: () => ({ text: 'Save', tooltip: 'Save conversation' })
  };

  window.eval(readFileSync('content-scripts/conversation-extractor-utils.js', 'utf8'));
  window.eval(readFileSync('content-scripts/chatgpt-history-extractor.js', 'utf8'));

  return window.__InsidebarChatGPTExtractorTest;
}

describe('ChatGPT Markdown exporter', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.happyDOM.setURL('https://chatgpt.com/c/test-conversation');
    vi.restoreAllMocks();
  });

  it('extracts messages with fallback selectors when role attributes are absent', () => {
    const api = loadChatGPTExtractor();

    document.body.innerHTML = `
      <main>
        <article data-testid="conversation-turn-1" class="group/conversation-turn user">
          <div class="whitespace-pre-wrap">请写一个函数</div>
        </article>
        <article data-testid="conversation-turn-2" class="group/conversation-turn assistant">
          <div class="markdown">
            <p>可以：</p>
            <pre><code class="language-js">function add(a, b) {
  return a + b;
}</code></pre>
          </div>
        </article>
      </main>
    `;

    const messages = api.getMessages();

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: 'user',
      content: '请写一个函数'
    });
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toContain('```js');
    expect(messages[1].content).toContain('function add');
  });

  it('downloads a Markdown file ordered by conversation turns', async () => {
    const api = loadChatGPTExtractor();
    let downloadedBlob;
    let downloadedName;

    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
      downloadedBlob = blob;
      return 'blob:insidebar-test';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function() {
      downloadedName = this.download;
    });

    document.body.innerHTML = `
      <main>
        <button data-testid="share-chat-button">Share</button>
        <article data-message-author-role="user">
          <div class="whitespace-pre-wrap">第一轮问题</div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown"><p>第一轮回答</p></div>
        </article>
        <article data-message-author-role="user">
          <div class="whitespace-pre-wrap">第二轮问题</div>
        </article>
      </main>
    `;

    await api.handleExportClick({ preventDefault() {}, stopPropagation() {} }, 'md');

    const markdown = await downloadedBlob.text();

    expect(downloadedName).toMatch(/第一轮问题-\d{4}-\d{2}-\d{2}\.md/);
    expect(markdown).toContain('# 第一轮问题');
    expect(markdown).toContain('## 第 1 轮');
    expect(markdown).toContain('### 问');
    expect(markdown).toContain('第一轮问题');
    expect(markdown).toContain('### 答');
    expect(markdown).toContain('第一轮回答');
    expect(markdown).toContain('## 第 2 轮');
    expect(markdown).toContain('第二轮问题');
  });

  it('generates a title from the first question when ChatGPT title is unavailable', async () => {
    const api = loadChatGPTExtractor();
    let downloadedBlob;
    let downloadedName;

    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
      downloadedBlob = blob;
      return 'blob:insidebar-test';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function() {
      downloadedName = this.download;
    });

    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user">
          <div class="whitespace-pre-wrap">用AI跑一遍摘要：没有标题怎么办？</div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown"><p>可以自动生成标题。</p></div>
        </article>
      </main>
    `;

    await api.handleExportClick({ preventDefault() {}, stopPropagation() {} }, 'md');

    const markdown = await downloadedBlob.text();

    expect(downloadedName).toMatch(/用AI跑一遍摘要-\d{4}-\d{2}-\d{2}\.md/);
    expect(markdown).toContain('# 用AI跑一遍摘要');
  });

  it('exports question and answer pairs when roles are mixed across turn containers', async () => {
    const api = loadChatGPTExtractor();
    let downloadedBlob;

    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
      downloadedBlob = blob;
      return 'blob:insidebar-test';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    document.body.innerHTML = `
      <main>
        <article data-testid="conversation-turn-1" class="group/conversation-turn">
          <div class="whitespace-pre-wrap">用户第一问</div>
        </article>
        <article data-testid="conversation-turn-2" class="group/conversation-turn">
          <div data-message-author-role="assistant">
            <div class="markdown"><p>助手第一答</p></div>
          </div>
        </article>
        <article data-testid="conversation-turn-3" class="group/conversation-turn">
          <div class="whitespace-pre-wrap">用户第二问</div>
        </article>
        <article data-testid="conversation-turn-4" class="group/conversation-turn">
          <div data-message-author-role="assistant">
            <div class="markdown"><p>助手第二答</p></div>
          </div>
        </article>
      </main>
    `;

    await api.handleExportClick({ preventDefault() {}, stopPropagation() {} }, 'md');

    const markdown = await downloadedBlob.text();

    expect(markdown).toContain('## 第 1 轮');
    expect(markdown).toContain('用户第一问');
    expect(markdown).toContain('助手第一答');
    expect(markdown).toContain('## 第 2 轮');
    expect(markdown).toContain('用户第二问');
    expect(markdown).toContain('助手第二答');
  });

  it('saves assistant reference sources in Markdown and JSON exports', async () => {
    const api = loadChatGPTExtractor();
    let downloadedBlob;
    let downloadedName;

    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
      downloadedBlob = blob;
      return 'blob:insidebar-test';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function() {
      downloadedName = this.download;
    });

    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user">
          <div class="whitespace-pre-wrap">VPN 定位风险是什么？</div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown">
            <p>主要风险包括账号风控。</p>
            <p><a href="https://example.com/vpn-risk">VPN 风险报告</a></p>
            <p><a href="https://example.com/vpn-risk">重复来源</a></p>
            <p><a href="/c/test-conversation">内部链接</a></p>
          </div>
        </article>
      </main>
    `;

    await api.handleExportClick({ preventDefault() {}, stopPropagation() {} }, 'md');

    const markdown = await downloadedBlob.text();
    const sourcesSection = markdown.split('### 参考来源')[1] || '';

    expect(downloadedName).toMatch(/VPN 定位风险是什么-\d{4}-\d{2}-\d{2}\.md/);
    expect(markdown).toContain('### 参考来源');
    expect(sourcesSection).toContain('1. [VPN 风险报告](https://example.com/vpn-risk)');
    expect(sourcesSection).not.toContain('重复来源](https://example.com/vpn-risk)');
    expect(sourcesSection).not.toContain('内部链接');

    await api.handleExportClick({ preventDefault() {}, stopPropagation() {} }, 'json');

    const json = JSON.parse(await downloadedBlob.text());

    expect(json.messages[1].sources).toEqual([
      {
        title: 'VPN 风险报告',
        url: 'https://example.com/vpn-risk'
      }
    ]);
  });

  it('merges reference sources when the same message is collected again after links render', async () => {
    const api = loadChatGPTExtractor();
    let downloadedBlob;
    let renderSources = false;

    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
      downloadedBlob = blob;
      return 'blob:insidebar-test';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      renderSources = true;
      document.body.innerHTML = `
        <main>
          <article data-message-author-role="user">
            <div class="whitespace-pre-wrap">引用会不会丢？</div>
          </article>
          <article data-message-author-role="assistant">
            <div class="markdown">
              <p>不会丢。</p>
              ${renderSources ? '<a href="https://example.com/source">来源</a>' : ''}
            </div>
          </article>
        </main>
      `;
    });

    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user">
          <div class="whitespace-pre-wrap">引用会不会丢？</div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown"><p>不会丢。</p></div>
        </article>
      </main>
    `;

    await api.handleExportClick({ preventDefault() {}, stopPropagation() {} }, 'json');

    const json = JSON.parse(await downloadedBlob.text());

    expect(json.messages[1].content).toContain('不会丢');
    expect(json.messages[1].sources).toEqual([
      {
        title: '来源',
        url: 'https://example.com/source'
      }
    ]);
  });

  it('inserts export buttons in a fallback toolbar when ChatGPT has no share button', () => {
    const api = loadChatGPTExtractor();

    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user">
          <div class="whitespace-pre-wrap">问题</div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown"><p>回答</p></div>
        </article>
      </main>
    `;

    api.insertSaveButton();

    expect(document.getElementById('insidebar-chatgpt-export-toolbar')).toBeTruthy();
    expect(document.getElementById('insidebar-export-markdown')?.textContent).toBe('下载MD');
    expect(document.getElementById('insidebar-export-json')?.textContent).toBe('下载JSON');
  });

  it('shows the fallback toolbar on conversation pages before messages are detected', () => {
    const api = loadChatGPTExtractor();

    document.body.innerHTML = '<main></main>';

    api.insertSaveButton();

    expect(document.getElementById('insidebar-chatgpt-export-toolbar')).toBeTruthy();
    expect(document.getElementById('insidebar-export-markdown')?.textContent).toBe('下载MD');
  });

  it('supports legacy chat.openai.com conversation URLs', () => {
    const api = loadChatGPTExtractor();

    window.happyDOM.setURL('https://chat.openai.com/c/test-conversation');
    document.body.innerHTML = '<main></main>';

    api.insertSaveButton();

    expect(document.getElementById('insidebar-chatgpt-export-toolbar')).toBeTruthy();
    expect(document.getElementById('insidebar-export-markdown')?.textContent).toBe('下载MD');
  });
});
