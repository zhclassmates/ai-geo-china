import { describe, expect, it } from 'vitest';
import {
  buildGeoRunMarkdownFilename,
  formatGeoRunAsMarkdown
} from '../modules/markdown-exporter.js';

describe('markdown-exporter', () => {
  it('formats a Doubao GEO run with answer and citations', () => {
    const markdown = formatGeoRunAsMarkdown({
      provider: 'doubao',
      providerName: '豆包',
      query: '重庆火锅品牌排行榜前十名有哪些',
      product: '刘一手火锅',
      answerMarkdown: '刘一手火锅在榜单中出现。',
      timestamp: Date.parse('2026-05-04T12:00:00.000Z'),
      url: 'https://www.doubao.com/chat/'
    }, [
      {
        visibleRank: 1,
        title: '重庆火锅品牌排行榜',
        domain: 'sohu.com',
        sourceType: 'media',
        snippet: '刘一手火锅作为标杆品牌。',
        url: 'https://example.com/a'
      }
    ]);

    expect(markdown).toContain('provider: doubao');
    expect(markdown).toContain('product: "刘一手火锅"');
    expect(markdown).toContain('## AI 回答');
    expect(markdown).toContain('| 1 | 重庆火锅品牌排行榜 | sohu.com | media | 刘一手火锅作为标杆品牌。 | [打开](https://example.com/a) |');
  });

  it('builds a safe Markdown filename', () => {
    const filename = buildGeoRunMarkdownFilename({
      provider: 'doubao',
      query: '重庆火锅品牌/排行榜?',
      timestamp: Date.parse('2026-05-04T12:00:00.000Z')
    });

    expect(filename).toBe('2026-05-04-doubao-重庆火锅品牌-排行榜-.md');
  });
});
