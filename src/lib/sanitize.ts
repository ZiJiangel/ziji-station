import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

marked.setOptions({ gfm: true, breaks: true });

/** Markdown → 安全 HTML（服务端/客户端都能跑） */
export function renderMarkdown(input: string): string {
  const raw = marked.parse(input, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
      'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img',
    ],
    ALLOWED_ATTR: ['href', 'title', 'alt', 'src', 'class'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/)/i,
  });
}

/** 纯文本安全化（昵称、简介、状态） */
export function sanitizeText(input: string): string {
  if (!input) return '';
  return DOMPurify.sanitize(String(input), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
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
