import { useCallback, useRef, useState } from "react";
import type { IssueWithScore, RiceScore } from "@/types";

interface SaveManagerOptions {
	org: string;
	projectId: string;
	/** Stable ref holding the current riceScoreFieldId. */
	riceScoreFieldIdRef: React.RefObject<string | null>;
	onIssueUpdated: (issueId: string, score: RiceScore, computedScore: number | null) => void;
}

export function useSaveManager({
	org,
	projectId,
	riceScoreFieldIdRef,
	onIssueUpdated,
}: SaveManagerOptions) {
	const [savingIssues, setSavingIssues] = useState<Set<string>>(new Set());
	const [errorCells, setErrorCells] = useState<Set<string>>(new Set());
	const [lastSavedIssueId, setLastSavedIssueId] = useState<string | null>(null);

	// Batched pending field changes: accumulate per-issue so a single PUT fires for all dirty fields.
	const pendingUpdates = useRef<Map<string, Partial<RiceScore>>>(new Map());
	const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
	// In-flight PUT tracker (cleared before response arrives).
	const savingRef = useRef<Set<string>>(new Set());
	// In-flight propagation tracker.
	const propagatingRef = useRef<Set<string>>(new Set());
	// Currently focused row (prevent refresh from overwriting it).
	const focusedIssueRef = useRef<string | null>(null);
	// Stable metadata ref so flushSave closure always sees current projectItemId.
	const issueMetaRef = useRef<Map<string, { projectItemId: string }>>(new Map());
	// Timer ref for the last-saved highlight.
	const lastSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	/** Returns the set of issue IDs that should not be overwritten by a background refresh. */
	function getBusyIds(): Set<string> {
		return new Set([
			...pendingUpdates.current.keys(),
			...debounceTimers.current.keys(),
			...savingRef.current,
			...propagatingRef.current,
			...(focusedIssueRef.current ? [focusedIssueRef.current] : []),
		]);
	}

	/** Keep the metadata map current whenever the issue list changes. */
	function syncIssueMeta(issues: IssueWithScore[]) {
		issueMetaRef.current = new Map(issues.map((i) => [i.id, { projectItemId: i.projectItemId }]));
	}

	function markPropagating(ids: string[]) {
		ids.forEach((id) => propagatingRef.current.add(id));
	}

	function unmarkPropagating(ids: string[]) {
		ids.forEach((id) => propagatingRef.current.delete(id));
	}

	/** Flush all pending field changes for an issue as a single PUT. */
	const flushSave = useCallback(
		async (issueId: string) => {
			const updates = pendingUpdates.current.get(issueId);
			if (!updates || Object.keys(updates).length === 0) return;
			savingRef.current.add(issueId);
			pendingUpdates.current.delete(issueId);

			const issueMeta = issueMetaRef.current.get(issueId);
			if (!issueMeta) return;

			setSavingIssues((prev) => new Set([...prev, issueId]));
			setErrorCells((prev) => {
				const next = new Set(prev);
				for (const key of next) {
					if (key.startsWith(`${issueId}:`)) next.delete(key);
				}
				return next;
			});

			try {
				let url = `/api/scores?org=${encodeURIComponent(org)}&projectId=${encodeURIComponent(projectId)}&issueId=${encodeURIComponent(issueId)}`;
				url += `&projectItemId=${encodeURIComponent(issueMeta.projectItemId)}`;
				const fieldId = riceScoreFieldIdRef.current;
				if (fieldId) url += `&fieldId=${encodeURIComponent(fieldId)}`;

				const res = await fetch(url, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(updates),
				});
				if (!res.ok) throw new Error("Save failed");

				const data = (await res.json()) as { score: RiceScore; computedScore: number | null };
				onIssueUpdated(issueId, data.score, data.computedScore);

				if (lastSavedTimerRef.current) clearTimeout(lastSavedTimerRef.current);
				setLastSavedIssueId(issueId);
				lastSavedTimerRef.current = setTimeout(() => setLastSavedIssueId(null), 30_000);
			} catch {
				setErrorCells((prev) => {
					const next = new Set(prev);
					for (const field of Object.keys(updates)) {
						next.add(`${issueId}:${field}`);
					}
					return next;
				});
			} finally {
				savingRef.current.delete(issueId);
				setSavingIssues((prev) => {
					const next = new Set(prev);
					next.delete(issueId);
					return next;
				});
			}
		},
		[org, projectId, riceScoreFieldIdRef, onIssueUpdated]
	);

	/** Updates a field's local value and queues the issue for saving. */
	const handleFieldChange = useCallback(
		(issueId: string, field: keyof RiceScore, value: number | null) => {
			const current = pendingUpdates.current.get(issueId) ?? {};
			pendingUpdates.current.set(issueId, { ...current, [field]: value });
		},
		[]
	);

	/** Cancels any pending debounce and saves immediately (triggered by Enter). */
	const handleFieldCommit = useCallback(
		(issueId: string) => {
			const timer = debounceTimers.current.get(issueId);
			if (timer) {
				clearTimeout(timer);
				debounceTimers.current.delete(issueId);
			}
			void flushSave(issueId);
		},
		[flushSave]
	);

	/** Starts a 1 s debounce then flushes, triggered when focus leaves a row. */
	const handleRowBlur = useCallback(
		(issueId: string) => {
			if (!pendingUpdates.current.has(issueId)) return;
			const existing = debounceTimers.current.get(issueId);
			if (existing) clearTimeout(existing);
			debounceTimers.current.set(
				issueId,
				setTimeout(() => {
					debounceTimers.current.delete(issueId);
					void flushSave(issueId);
				}, 1_000)
			);
		},
		[flushSave]
	);

	/** Resets all RICE fields to null for an issue (PUT with all-null body). */
	const handleReset = useCallback(
		async (issueId: string) => {
			const issueMeta = issueMetaRef.current.get(issueId);
			if (!issueMeta) return;

			savingRef.current.add(issueId);
			setSavingIssues((prev) => new Set([...prev, issueId]));

			try {
				let url = `/api/scores?org=${encodeURIComponent(org)}&projectId=${encodeURIComponent(projectId)}&issueId=${encodeURIComponent(issueId)}`;
				url += `&projectItemId=${encodeURIComponent(issueMeta.projectItemId)}`;
				const fieldId = riceScoreFieldIdRef.current;
				if (fieldId) url += `&fieldId=${encodeURIComponent(fieldId)}`;

				const res = await fetch(url, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ reach: null, impact: null, confidence: null, effort: null }),
				});
				if (!res.ok) throw new Error("Reset failed");

				const data = (await res.json()) as { score: RiceScore; computedScore: number | null };
				onIssueUpdated(issueId, data.score, data.computedScore);

				if (lastSavedTimerRef.current) clearTimeout(lastSavedTimerRef.current);
				setLastSavedIssueId(issueId);
				lastSavedTimerRef.current = setTimeout(() => setLastSavedIssueId(null), 30_000);
			} catch {
				// reset failure is silent
			} finally {
				savingRef.current.delete(issueId);
				setSavingIssues((prev) => {
					const next = new Set(prev);
					next.delete(issueId);
					return next;
				});
			}
		},
		[org, projectId, riceScoreFieldIdRef, onIssueUpdated]
	);

	return {
		savingIssues,
		errorCells,
		lastSavedIssueId,
		focusedIssueRef,
		getBusyIds,
		syncIssueMeta,
		markPropagating,
		unmarkPropagating,
		handleFieldChange,
		handleFieldCommit,
		handleRowBlur,
		handleReset,
	};
}
