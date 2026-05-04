function escapeMdTable(value = '') {
  return String(value)
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .trim();
}

function escapeYamlString(value = '') {
  return String(value).replace(/"/g, '\\"');
}

function safeFilename(value = '') {
  return String(value)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

export function formatGeoRunAsMarkdown(run, citations = run.citations || []) {
  const title = run.title || `${run.providerName || run.provider || 'AI'} - ${run.query || 'AI回答审计'}`;
  const createdAt = new Date(run.timestamp || run.createdAt || Date.now()).toISOString();

  const citationRows = citations.map((citation, index) => {
    const title = citation.title || citation.anchorText || citation.domain || 'Untitled source';
    const rank = citation.visibleRank || citation.position || index + 1;
    const sourceType = citation.sourceType || '';
    const snippet = citation.snippet || citation.anchorText || '';
    const link = citation.url ? `[打开](${citation.url})` : '';

    return `| ${rank} | ${escapeMdTable(title)} | ${escapeMdTable(citation.domain || '')} | ${escapeMdTable(sourceType)} | ${escapeMdTable(snippet)} | ${link} |`;
  }).join('\n');

  return `---
type: ai_geo_audit
provider: ${run.provider || ''}
provider_name: ${run.providerName || ''}
query: "${escapeYamlString(run.query || '')}"
product: "${escapeYamlString(run.product || '')}"
created_at: ${createdAt}
source_url: ${run.url || ''}
citation_count: ${citations.length}
---

# ${title}

## 问题

${run.query || ''}

## 目标品牌 / 产品

${run.product || ''}

## AI 回答

${run.answerMarkdown || run.answerText || ''}

## 引用源

| # | 标题 | 域名 | 类型 | 摘要 | 链接 |
|---:|---|---|---|---|---|
${citationRows || '| - | 无 | - | - | - | - |'}

## 审计备注

- 平台：${run.providerName || run.provider || ''}
- 引用数量：${citations.length}
- 页面地址：${run.url || ''}
- 保存时间：${createdAt}
`;
}

export function buildGeoRunMarkdownFilename(run) {
  const date = new Date(run.timestamp || run.createdAt || Date.now())
    .toISOString()
    .slice(0, 10);

  const provider = safeFilename(run.provider || 'ai');
  const query = safeFilename(run.query || run.product || 'geo-run');

  return `${date}-${provider}-${query}.md`;
}
