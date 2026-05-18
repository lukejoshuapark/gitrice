import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
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

const POLL_INTERVAL = 10_000;

interface UseIssuesOptions {
	org: string;
	projectId: string;
	/** When false, polling is suspended. */
	autoRefresh: boolean;
	/** Returns IDs of rows currently being edited; polling is paused while non-empty. */
	getBusyIds: () => Set<string>;
	/** Called when polling stops automatically after 10 minutes of no data changes. */
	onIdleTimeout?: () => void;
}

export function useIssues({ org, projectId, autoRefresh, getBusyIds, onIdleTimeout }: UseIssuesOptions) {
	// Tracks the last seen issue-id hash and when it last changed.
	const lastHashRef = useRef<string | null>(null);
	const lastHashChangeTimeRef = useRef<number>(Date.now());
	// Always-current ref so the timer effect doesn't need onIdleTimeout in its deps.
	const onIdleTimeoutRef = useRef(onIdleTimeout);
	onIdleTimeoutRef.current = onIdleTimeout;

	const query = useQuery({
		queryKey: issuesQueryKey(org, projectId),
		queryFn: async ({ signal }) => fetchIssues(org, projectId, signal),
		// Track the issue-id hash to detect data changes.
		// Always returns fresh server data — busy-row protection is handled in IssueTable.
		select: (fresh) => {
			const newHash = fresh.issues.map((i) => i.id).join(",");
			if (newHash !== lastHashRef.current) {
				lastHashRef.current = newHash;
				lastHashChangeTimeRef.current = Date.now();
			}
			return fresh;
		},
		refetchInterval: (query) => {
			// Polling suspended by user.
			if (!autoRefresh) return false;
			// Pause while a row is being edited.
			if (getBusyIds().size > 0) return false;
			// Turn off after 10 minutes with no data changes.
			if (Date.now() - lastHashChangeTimeRef.current > 10 * 60 * 1000) return false;
			// Don't poll during the initial load.
			if (!query.state.data) return false;
			return POLL_INTERVAL;
		},
		staleTime: 0,
	});

	// When auto-refresh is on, schedule a timer that fires onIdleTimeout once 10 minutes
	// have elapsed since the last data change. Recalculated after every successful fetch.
	useEffect(() => {
		if (!autoRefresh || !query.data) return;
		const remaining = 10 * 60 * 1000 - (Date.now() - lastHashChangeTimeRef.current);
		if (remaining <= 0) {
			onIdleTimeoutRef.current?.();
			return;
		}
		const timer = setTimeout(() => onIdleTimeoutRef.current?.(), remaining);
		return () => clearTimeout(timer);
	}, [autoRefresh, query.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

	return {
		issues: query.data?.issues ?? [],
		riceScoreFieldId: query.data?.riceScoreFieldId ?? null,
		isLoading: query.isLoading,
		error: query.error ? (query.error instanceof Error ? query.error.message : "An error occurred") : null,
		refreshInterval: POLL_INTERVAL,
		/** True while a background refetch is in flight (not the initial load). Used to show a fetching indicator. */
		isFetching: query.isFetching && query.isSuccess,
		/** Millisecond timestamp of the last successful fetch. Changes on every poll — use as an animation reset key. */
		dataUpdatedAt: query.dataUpdatedAt,
		/** Resets the idle timer and fires an immediate refetch — call when re-enabling auto-refresh. */
		resetAndRefetch: () => {
			lastHashChangeTimeRef.current = Date.now();
			lastHashRef.current = null;
			void query.refetch();
		},
		refetch: query.refetch,
	};
}
