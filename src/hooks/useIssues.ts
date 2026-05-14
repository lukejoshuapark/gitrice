import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { IssueWithScore } from "@/types";

interface IssuesResponse {
	issues: IssueWithScore[];
	riceScoreFieldId: string | null;
}

async function fetchIssues(
	org: string,
	projectId: string,
	signal: AbortSignal
): Promise<IssuesResponse> {
	const url = `/api/issues?projectId=${encodeURIComponent(projectId)}&org=${encodeURIComponent(org)}`;
	const res = await fetch(url, { signal });
	if (!res.ok) throw new Error("Failed to load issues");
	return res.json() as Promise<IssuesResponse>;
}

export function issuesQueryKey(org: string, projectId: string) {
	return ["issues", org, projectId] as const;
}

interface UseIssuesOptions {
	org: string;
	projectId: string;
	/** Returns the set of issue IDs that are currently busy (being saved/edited). */
	getBusyIds: () => Set<string>;
	/** When false, polling is suspended. */
	autoRefresh: boolean;
}

export function useIssues({ org, projectId, getBusyIds, autoRefresh }: UseIssuesOptions) {
	// Tracks the last seen issue-id hash and when it last changed for adaptive polling.
	const lastHashRef = useRef<string | null>(null);
	const lastHashChangeTimeRef = useRef<number>(Date.now());
	const refreshIntervalRef = useRef<number>(10_000);

	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: issuesQueryKey(org, projectId),
		queryFn: async ({ signal }) => fetchIssues(org, projectId, signal),
		// On every background refetch, skip overwriting issues that are currently busy.
		placeholderData: (prev) => {
			if (!prev) return undefined;
			const busy = getBusyIds();
			if (busy.size === 0) return undefined; // Let TanStack replace normally
			// Keep the previous data as placeholder so the merge in `select` can run.
			return prev;
		},
		// Merge: keep busy rows from the previous result.
		select: (fresh) => {
			// Always update the adaptive interval based on whether the issue list changed.
			// This MUST happen before any early return so polling never gets permanently stuck.
			const newHash = fresh.issues.map((i) => i.id).join(",");
			if (newHash !== lastHashRef.current) {
				lastHashRef.current = newHash;
				lastHashChangeTimeRef.current = Date.now();
				refreshIntervalRef.current = 5_000;
			} else {
				refreshIntervalRef.current = Math.min(refreshIntervalRef.current + 1_000, 30_000);
			}

			const busy = getBusyIds();
			if (busy.size === 0) return fresh;

			// We need the previous cached data to merge with.
			const prev = queryClient.getQueryData<IssuesResponse>(issuesQueryKey(org, projectId));
			if (!prev) return fresh;

			const prevMap = new Map(prev.issues.map((i) => [i.id, i]));
			const merged = fresh.issues.map((m) => (busy.has(m.id) ? (prevMap.get(m.id) ?? m) : m));

			return { ...fresh, issues: merged };
		},
		refetchInterval: (query) => {
			// Polling suspended by user.
			if (!autoRefresh) return false;
			// Stop polling after 10 minutes with no list change.
			if (Date.now() - lastHashChangeTimeRef.current > 10 * 60 * 1000) return false;
			// Don't poll during the initial load.
			if (!query.state.data) return false;
			return refreshIntervalRef.current;
		},
		staleTime: 0,
	});

	return {
		issues: query.data?.issues ?? [],
		riceScoreFieldId: query.data?.riceScoreFieldId ?? null,
		isLoading: query.isLoading,
		error: query.error ? (query.error instanceof Error ? query.error.message : "An error occurred") : null,
		refreshInterval: refreshIntervalRef.current,
		/** Millisecond timestamp of the last successful fetch. Changes on every poll — use as an animation reset key. */
		dataUpdatedAt: query.dataUpdatedAt,
		/** Resets the adaptive interval and fires an immediate refetch — call when re-enabling auto-refresh. */
		resetAndRefetch: () => {
			refreshIntervalRef.current = 5_000;
			lastHashChangeTimeRef.current = Date.now();
			lastHashRef.current = null;
			void query.refetch();
		},
		refetch: query.refetch,
	};
}
