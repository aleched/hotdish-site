import DOMPurify from 'dompurify';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

/**
 * Raw HTML in markdown is intentionally dropped rather than passed through: repository content
 * is untrusted, and access tokens live in localStorage, so an XSS here would leak them.
 * DOMPurify then runs as defence in depth.
 */
const processor = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkRehype, { allowDangerousHtml: false })
	.use(rehypeStringify);

export function markdownToUnsafeHtml(markdown: string): string {
	return String(processor.processSync(markdown));
}

export function sanitizeHtml(html: string): string {
	return DOMPurify.sanitize(html, {
		USE_PROFILES: { html: true },
		ADD_ATTR: ['target', 'rel'],
		FORBID_TAGS: ['style', 'form', 'input', 'button'],
		FORBID_ATTR: ['style']
	});
}

/** Renders markdown to HTML that is safe to inject. Browser-only, since it needs a DOM. */
export function renderMarkdown(markdown: string): string {
	return sanitizeHtml(markdownToUnsafeHtml(markdown));
}
