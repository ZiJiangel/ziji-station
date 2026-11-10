import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

marked.setOptions({ gfm: true, breaks: true });

/** Markdown → 安全 HTML（兼容 Cloudflare Workers） */
export function renderMarkdown(input: string): string {
  const raw = marked.parse(input, { async: false }) as string;
  return sanitizeHtml(raw, {
    allowedTags: [
      'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
      'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
      code: ['class']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}

/** 纯文本安全化（昵称、简介、状态） */
export function sanitizeText(input: string): string {
  if (!input) return '';
  return sanitizeHtml(String(input), { allowedTags: [], allowedAttributes: {} });
}

/** 校验外链，只允许 http/https/mailto */
export function safeUrl(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}
