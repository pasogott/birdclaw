import type {
	ProfileAnalysisContext,
	ProfileAnalysisRunResult,
} from "#/lib/profile-analysis";
import type { ProfileRecord } from "#/lib/types";

export interface ProfileAnalysisRequestOptions {
	refresh: boolean;
	maxTweets: number;
	maxPages: number;
	maxConversations: number;
	maxConversationPages: number;
}

export const DEFAULT_PROFILE_ANALYSIS_LIMITS = {
	maxTweets: 10000,
	maxPages: 100,
	maxConversations: 80,
	maxConversationPages: 3,
} as const;

const PROFILE_HYDRATION_LIMIT = 50;
const PROFILE_MENTION_RE = /(^|[^\w@./])@([A-Za-z0-9_]{1,15})\b/g;

export function normalizeProfileHandle(value: string) {
	return value.trim().replace(/^@/, "").toLowerCase();
}

export function handlesFromText(value: string) {
	return Array.from(value.matchAll(PROFILE_MENTION_RE)).map(
		(match) => match[2],
	);
}

export function knownProfileHandles(context: ProfileAnalysisContext) {
	const handles = new Set<string>();
	handles.add(normalizeProfileHandle(context.profile.handle));
	for (const profile of context.profiles ?? []) {
		handles.add(normalizeProfileHandle(profile.handle));
	}
	for (const tweet of context.conversations) {
		handles.add(normalizeProfileHandle(tweet.author));
	}
	return handles;
}

export function collectProfileAnalysisHydrationHandles({
	context,
	analysis,
	markdown,
}: {
	context: ProfileAnalysisContext;
	analysis?: ProfileAnalysisRunResult["analysis"];
	markdown?: string;
}) {
	const handles = new Set<string>();
	const known = knownProfileHandles(context);
	const add = (value: string | undefined) => {
		if (!value) return;
		const handle = normalizeProfileHandle(value);
		if (!/^[a-z0-9_]{1,15}$/.test(handle) || known.has(handle)) return;
		handles.add(handle);
	};

	for (const handle of analysis?.sourceHandles ?? []) add(handle);
	for (const theme of analysis?.themes ?? []) {
		for (const handle of theme.handles) add(handle);
	}
	if (markdown) {
		for (const handle of handlesFromText(markdown)) add(handle);
	}
	for (const handle of handlesFromText(context.profile.bio)) add(handle);
	for (const tweet of context.tweets) {
		for (const handle of handlesFromText(tweet.text)) add(handle);
	}
	for (const tweet of context.conversations) {
		for (const handle of handlesFromText(tweet.text)) add(handle);
		for (const handle of handlesFromText(tweet.bio)) add(handle);
	}

	return [...handles].slice(0, PROFILE_HYDRATION_LIMIT);
}

export function applyHydratedProfilesToProfileAnalysisContext(
	context: ProfileAnalysisContext,
	profiles: ProfileRecord[],
) {
	const existing = new Map<string, ProfileRecord>();
	for (const profile of context.profiles ?? []) {
		existing.set(normalizeProfileHandle(profile.handle), profile);
	}
	for (const profile of profiles) {
		existing.set(normalizeProfileHandle(profile.handle), profile);
	}
	return {
		...context,
		profiles: [...existing.values()],
	};
}

export async function hydrateProfileAnalysisContext({
	context,
	analysis,
	markdown,
	requestedHandles,
}: {
	context: ProfileAnalysisContext;
	analysis?: ProfileAnalysisRunResult["analysis"];
	markdown?: string;
	requestedHandles?: Set<string>;
}) {
	const handles = collectProfileAnalysisHydrationHandles({
		context,
		analysis,
		markdown,
	}).filter((handle) => !requestedHandles?.has(handle));
	if (handles.length === 0) return context;
	for (const handle of handles) {
		requestedHandles?.add(handle);
	}
	const url = new URL("/api/profile-hydrate", window.location.origin);
	url.searchParams.set("handles", handles.join(","));
	const response = await fetch(url);
	if (!response.ok) return context;
	const payload = (await response.json()) as {
		results?: Array<{ status?: string; profile?: ProfileRecord }>;
	};
	const profiles = (payload.results ?? [])
		.filter((item) => item.status === "hit" && item.profile)
		.map((item) => item.profile as ProfileRecord);
	return profiles.length > 0
		? applyHydratedProfilesToProfileAnalysisContext(context, profiles)
		: context;
}

export function profileAnalysisUrl(
	handle: string,
	options: ProfileAnalysisRequestOptions,
) {
	const params = new URLSearchParams();
	params.set("handle", handle);
	params.set("maxTweets", String(options.maxTweets));
	params.set("maxPages", String(options.maxPages));
	params.set("maxConversations", String(options.maxConversations));
	params.set("maxConversationPages", String(options.maxConversationPages));
	if (options.refresh) {
		params.set("refresh", "true");
	}
	return `/api/profile-analysis?${params.toString()}`;
}

export async function profileAnalysisRequestError(response: Response) {
	const status = `${String(response.status)}${response.statusText ? ` ${response.statusText}` : ""}`;
	let detail = "";
	try {
		const contentType = response.headers.get("content-type") ?? "";
		if (contentType.includes("application/json")) {
			const payload = (await response.json()) as {
				error?: unknown;
				message?: unknown;
			};
			if (typeof payload.message === "string") detail = payload.message;
			else if (typeof payload.error === "string") detail = payload.error;
		} else {
			detail = (await response.text()).trim();
		}
	} catch {
		detail = "";
	}
	return new Error(
		detail
			? `Profile analysis failed (${status}): ${detail}`
			: `Profile analysis failed (${status})`,
	);
}

export function formatProfileAnalysisCounts(
	context: ProfileAnalysisContext | null,
) {
	if (!context) return "xurl profile backfill with cached AI analysis.";
	return [
		context.fetchCached ? "cached backfill" : "fresh xurl backfill",
		`${String(context.counts.tweets)} tweets`,
		`${String(context.counts.conversationTweets)} conversation tweets`,
		`${String(context.counts.conversationsScanned)} conversations`,
	].join(" · ");
}

export function cleanProfileHandle(value: string) {
	return value.trim().replace(/^@/, "");
}
