import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { Effect } from "effect";
import type { EmbeddedTweet } from "#/lib/types";
import { runEffectPromise } from "./effect-runtime";

type ConversationStatus = "idle" | "loading" | "ready" | "error";

interface ConversationRecord {
	error: string | null;
	items: EmbeddedTweet[];
	status: ConversationStatus;
}

interface ConversationSurfaceSnapshot {
	expandedTweetId: string | null;
	records: ReadonlyMap<string, ConversationRecord>;
}

type Listener = () => void;

const emptyRecord: ConversationRecord = {
	error: null,
	items: [],
	status: "idle",
};

let snapshot: ConversationSurfaceSnapshot = {
	expandedTweetId: null,
	records: new Map(),
};
const listeners = new Set<Listener>();
const inFlight = new Set<string>();
let activeScopes = 0;
let generation = 0;

function emit() {
	for (const listener of listeners) {
		listener();
	}
}

function setSnapshot(next: ConversationSurfaceSnapshot) {
	snapshot = next;
	emit();
}

function updateRecord(tweetId: string, record: ConversationRecord) {
	const records = new Map(snapshot.records);
	records.set(tweetId, record);
	setSnapshot({ ...snapshot, records });
}

function subscribe(listener: Listener) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function getSnapshot() {
	return snapshot;
}

function fetchConversationItemsEffect(tweetId: string) {
	return Effect.gen(function* () {
		const response = yield* Effect.tryPromise({
			try: () =>
				fetch(`/api/conversation?tweetId=${encodeURIComponent(tweetId)}`),
			catch: (error) => error,
		});
		const data = (yield* Effect.tryPromise({
			try: () => response.json(),
			catch: (error) => error,
		})) as {
			error?: string;
			items?: EmbeddedTweet[];
			ok?: boolean;
		};
		if (!response.ok || data.ok === false) {
			return yield* Effect.fail(
				new Error(data.error ?? "Conversation unavailable"),
			);
		}
		return (data.items ?? []).filter(Boolean);
	});
}

export function loadConversationEffect(
	surfaceId: string,
	tweetId = surfaceId,
): Effect.Effect<void, never> {
	return Effect.gen(function* () {
		const current = snapshot.records.get(surfaceId);
		if (current?.status === "ready" || inFlight.has(surfaceId)) {
			return;
		}

		const loadGeneration = generation;
		inFlight.add(surfaceId);
		yield* Effect.gen(function* () {
			updateRecord(surfaceId, {
				error: null,
				items: current?.items ?? [],
				status: "loading",
			});

			const result = yield* fetchConversationItemsEffect(tweetId).pipe(
				Effect.match({
					onFailure: (error) => ({ error, ok: false as const }),
					onSuccess: (items) => ({ items, ok: true as const }),
				}),
			);

			if (loadGeneration !== generation) {
				return;
			}
			if (result.ok) {
				updateRecord(surfaceId, {
					error: null,
					items: result.items,
					status: "ready",
				});
			} else {
				updateRecord(surfaceId, {
					error:
						result.error instanceof Error
							? result.error.message
							: "Conversation unavailable",
					items: [],
					status: "error",
				});
			}
		}).pipe(Effect.ensuring(Effect.sync(() => inFlight.delete(surfaceId))));
	});
}

function loadConversation(surfaceId: string, tweetId = surfaceId) {
	return runEffectPromise(loadConversationEffect(surfaceId, tweetId));
}

export function retainConversationSurfaceScope() {
	activeScopes += 1;
	return () => {
		activeScopes = Math.max(0, activeScopes - 1);
		if (activeScopes === 0) {
			resetConversationSurface();
		}
	};
}

export function resetConversationSurface() {
	generation += 1;
	inFlight.clear();
	setSnapshot({
		expandedTweetId: null,
		records: new Map(),
	});
}

export function ConversationSurfaceScope({
	children,
}: {
	children: ReactNode;
}) {
	useEffect(() => retainConversationSurfaceScope(), []);
	return children;
}

export function useConversationSurface(surfaceId: string, tweetId = surfaceId) {
	const currentSnapshot = useSyncExternalStore(
		subscribe,
		getSnapshot,
		getSnapshot,
	);
	const record = currentSnapshot.records.get(surfaceId) ?? emptyRecord;
	const isOpen = currentSnapshot.expandedTweetId === surfaceId;

	const toggle = useCallback(() => {
		const nextExpanded =
			snapshot.expandedTweetId === surfaceId ? null : surfaceId;
		setSnapshot({ ...snapshot, expandedTweetId: nextExpanded });
		if (nextExpanded) {
			void loadConversation(surfaceId, tweetId);
		}
	}, [surfaceId, tweetId]);

	const prefetch = useCallback(() => {
		const current = snapshot.records.get(surfaceId);
		if (current?.status === "ready" || current?.status === "loading") {
			return;
		}
		void loadConversation(surfaceId, tweetId);
	}, [surfaceId, tweetId]);

	return {
		error: record.error,
		isOpen,
		items: record.items,
		loading: record.status === "loading",
		prefetch,
		status: record.status,
		toggle,
	};
}
