import { decodeBase64Url, encodeBase64Url } from '$lib/util/base64';
import type { ForgeKind, RepoRef } from '$lib/forge/types';

const KINDS: ForgeKind[] = ['github', 'gitlab', 'gitea'];

/**
 * Share links carry only the repository identity and path — never a token. Base64 is encoding,
 * not encryption, so anything placed here must be safe to publish.
 */
export function encodeSrc(ref: RepoRef): string {
	let plain = `${ref.kind}:${ref.host}/${ref.owner}/${ref.repo}`;
	if (ref.ref) plain += `@${ref.ref}`;
	if (ref.basePath) plain += `#${trimSlashes(ref.basePath)}`;
	return encodeBase64Url(plain);
}

export function decodeSrc(src: string): RepoRef {
	let plain: string;
	try {
		plain = decodeBase64Url(src);
	} catch {
		throw new Error('This link is malformed.');
	}

	const hashIndex = plain.indexOf('#');
	const basePath = hashIndex === -1 ? undefined : plain.slice(hashIndex + 1) || undefined;
	const head = hashIndex === -1 ? plain : plain.slice(0, hashIndex);

	const colonIndex = head.indexOf(':');
	if (colonIndex === -1) throw new Error('This link is malformed.');

	const kind = head.slice(0, colonIndex) as ForgeKind;
	if (!KINDS.includes(kind)) throw new Error(`Unsupported forge "${kind}".`);

	let rest = head.slice(colonIndex + 1);
	let gitRef: string | undefined;
	const atIndex = rest.lastIndexOf('@');
	if (atIndex !== -1) {
		gitRef = rest.slice(atIndex + 1) || undefined;
		rest = rest.slice(0, atIndex);
	}

	const segments = rest.split('/').filter(Boolean);
	if (segments.length < 3) throw new Error('This link is missing repository details.');

	const [host, owner, ...repoParts] = segments;
	return {
		kind,
		host,
		owner,
		repo: repoParts.join('/'),
		ref: gitRef,
		basePath
	};
}

export function trimSlashes(value: string): string {
	return value.replace(/^\/+|\/+$/g, '');
}
