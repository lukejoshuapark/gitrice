"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScoreCell } from "./ScoreCell";
import type { IssueWithScore, RiceScore } from "@/types";

interface IssueTableProps {
	org: string;
	projectId: string;
}

function Spinner({ className }: { className?: string }) {
	return (
		<svg
			className={["animate-spin", className ?? "h-3 w-3"].join(" ")}
			fill="none"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
			<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
		</svg>
	);
}

export function IssueTable({ org, projectId }: IssueTableProps) {
	const [issues, setIssues] = useState<IssueWithScore[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [savingIssues, setSavingIssues] = useState<Set<string>>(new Set());
	const [errorCells, setErrorCells] = useState<Set<string>>(new Set());
	const [propagatingMilestones, setPropagatingMilestones] = useState<Set<string>>(new Set());
	const [milestoneFilter, setMilestoneFilter] = useState<string | null>(null);
	const [riceScoreFieldId, setRiceScoreFieldId] = useState<string | null>(null);
	const [autoRefresh, setAutoRefresh] = useState(true);

	// Refs for batched save: accumulate per-issue pending field changes so a
	// single PUT fires for all dirty fields instead of one PUT per field.
	const pendingUpdates = useRef<Map<string, Partial<RiceScore>>>(new Map());
	const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
	// Tracks issues whose PUT is currently in-flight (pendingUpdates is cleared before the response arrives).
	const savingRef = useRef<Set<string>>(new Set());
	// Tracks issues that are part of an in-flight propagation POST.
	const propagatingRef = useRef<Set<string>>(new Set());
	// Tracks which issue row currently has keyboard focus (including focus before any typing).
	const focusedIssueRef = useRef<string | null>(null);
	// Stable ref so flushSave closure always sees current issue metadata.
	const issueMetaRef = useRef<Map<string, { projectItemId: string }>>(new Map());

	const riceScoreFieldIdRef = useRef<string | null>(null);
	riceScoreFieldIdRef.current = riceScoreFieldId;
	const lastActivityRef = useRef(Date.now());
	const loadingRef = useRef(false);

	const fetchData = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
		if (silent && loadingRef.current) return;

		// Snapshot which issues are busy RIGHT NOW, before any awaits.
		// Checking inside the setIssues updater is too late — a save or propagation
		// can complete during the network round-trip and clear its own ref, causing
		// the stale GET response to overwrite data the user just changed.
		const busyAtFetchStart = silent ? new Set<string>([
			...pendingUpdates.current.keys(),
			...debounceTimers.current.keys(),
			...savingRef.current,
			...propagatingRef.current,
			...(focusedIssueRef.current ? [focusedIssueRef.current] : []),
		]) : null;

		if (!silent) {
			setLoading(true);
			loadingRef.current = true;
		}
		setError(null);
		try {
			const issuesRes = await fetch(
				`/api/issues?projectId=${encodeURIComponent(projectId)}&org=${encodeURIComponent(org)}`
			);

			if (!issuesRes.ok) throw new Error("Failed to load issues");

			// Server returns issues already merged with scores, computed, and sorted.
			const { issues: merged, riceScoreFieldId: fieldId } =
				await issuesRes.json() as { issues: IssueWithScore[]; riceScoreFieldId: string | null };

			setRiceScoreFieldId(fieldId);

			if (silent) {
				// Don't overwrite rows that were busy when this refresh started.
				setIssues((prev) => {
					const prevMap = new Map(prev.map((i) => [i.id, i]));
					return merged.map((m) =>
						busyAtFetchStart!.has(m.id)
							? (prevMap.get(m.id) ?? m)
							: m
					);
				});
			} else {
				setIssues(merged);
			}
		} catch (err) {
			if (!silent) setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			if (!silent) {
				setLoading(false);
				loadingRef.current = false;
			}
		}
	}, [org, projectId]);

	useEffect(() => {
		setMilestoneFilter(null);
		fetchData();
	}, [fetchData]);

	// Keep issueMetaRef current whenever issues updates.
	useEffect(() => {
		issueMetaRef.current = new Map(
			issues.map((i) => [i.id, { projectItemId: i.projectItemId }])
		);
	}, [issues]);

	// Track user activity to auto-disable refresh after 5 minutes of inactivity.
	useEffect(() => {
		const onActivity = () => { lastActivityRef.current = Date.now(); };
		document.addEventListener("pointermove", onActivity, { passive: true });
		document.addEventListener("keydown", onActivity, { passive: true });
		return () => {
			document.removeEventListener("pointermove", onActivity);
			document.removeEventListener("keydown", onActivity);
		};
	}, []);

	// Auto-refresh every 10 s; disables itself after 5 minutes of inactivity.
	useEffect(() => {
		if (!autoRefresh) return;
		const id = setInterval(async () => {
			if (Date.now() - lastActivityRef.current > 5 * 60 * 1000) {
				setAutoRefresh(false);
				return;
			}
			await fetchData({ silent: true });
		}, 10_000);
		return () => clearInterval(id);
	}, [autoRefresh, fetchData]);

	/** Flush all pending field changes for an issue as a single PUT request. */
	const flushSave = useCallback(async (issueId: string) => {
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

		let saved = false;
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
			saved = true;
		} catch {
			setErrorCells((prev) => {
				const next = new Set(prev);
				for (const field of Object.keys(updates)) {
					next.add(`${issueId}:${field}`);
				}
				return next;
			});
		} finally {
			// Clear before the refresh so the issue is no longer "busy" and the
			// refresh can freely apply the server's newly computed score.
			savingRef.current.delete(issueId);
			setSavingIssues((prev) => {
				const next = new Set(prev);
				next.delete(issueId);
				return next;
			});
		}
		// Fetch the server-computed score now that the save is confirmed.
		if (saved) void fetchData({ silent: true });
	}, [org, projectId, fetchData]);

	/** Called by ScoreCell on every keystroke — updates field values locally; score recomputed by server on save. */
	const handleFieldChange = useCallback((issueId: string, field: keyof RiceScore, value: number | null) => {
		setIssues((prev) =>
			prev.map((issue) => {
				if (issue.id !== issueId) return issue;
				return { ...issue, score: { ...issue.score, [field]: value } };
			})
		);

		// Accumulate changes; the row-blur handler will trigger the actual save.
		const current = pendingUpdates.current.get(issueId) ?? {};
		pendingUpdates.current.set(issueId, { ...current, [field]: value });
	}, []);

	/** Called by ScoreCell on Enter — cancels any pending row-blur debounce and saves immediately. */
	const handleFieldCommit = useCallback((issueId: string) => {
		const timer = debounceTimers.current.get(issueId);
		if (timer) {
			clearTimeout(timer);
			debounceTimers.current.delete(issueId);
		}
		flushSave(issueId);
	}, [flushSave]);

	/** Called when focus leaves a row entirely — starts a 1 s debounce then saves. */
	const handleRowBlur = useCallback((issueId: string) => {
		if (!pendingUpdates.current.has(issueId)) return;
		const existing = debounceTimers.current.get(issueId);
		if (existing) clearTimeout(existing);
		debounceTimers.current.set(
			issueId,
			setTimeout(() => {
				debounceTimers.current.delete(issueId);
				flushSave(issueId);
			}, 1000)
		);
	}, [flushSave]);

	const handlePropagate = useCallback(async (sourceIssue: IssueWithScore) => {
		if (!sourceIssue.milestone) return;
		const milestoneTitle = sourceIssue.milestone.title;
		const targetItems = issues
			.filter((i) => i.milestone?.title === milestoneTitle && i.id !== sourceIssue.id)
			.map((i) => ({ issueId: i.id, itemId: i.projectItemId }));
		if (targetItems.length === 0) return;
		const targetIds = targetItems.map((t) => t.issueId);

		targetIds.forEach((id) => propagatingRef.current.add(id));
		setPropagatingMilestones((prev) => new Set([...prev, milestoneTitle]));
		let propagated = false;
		try {
			const res = await fetch("/api/scores/propagate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					org,
					projectId,
					score: sourceIssue.score,
					items: targetItems,
					...(riceScoreFieldId ? { fieldId: riceScoreFieldId } : {}),
				}),
			});
			if (!res.ok) throw new Error("Failed to propagate scores");
			propagated = true;
		} catch (err) {
			console.error("Propagate failed:", err);
		} finally {
			targetIds.forEach((id) => propagatingRef.current.delete(id));
			setPropagatingMilestones((prev) => {
				const next = new Set(prev);
				next.delete(milestoneTitle);
				return next;
			});
		}
		// Refresh from the server so the UI reflects what was actually written.
		if (propagated) void fetchData({ silent: true });
	}, [issues, org, projectId, riceScoreFieldId, fetchData]);

	// Issues where "Push to Milestone" should appear: has a computed score AND
	// shares a milestone with at least one other issue whose computed score differs.
	const milestonePushEligible = useMemo(() => {
		const byMilestone = new Map<string, IssueWithScore[]>();
		for (const issue of issues) {
			if (!issue.milestone || issue.computedScore === null) continue;
			const title = issue.milestone.title;
			if (!byMilestone.has(title)) byMilestone.set(title, []);
			byMilestone.get(title)!.push(issue);
		}
		const eligible = new Set<string>();
		for (const siblings of byMilestone.values()) {
			if (siblings.length < 2) continue;
			const first = siblings[0].computedScore;
			if (siblings.some((s) => s.computedScore !== first)) {
				for (const s of siblings) eligible.add(s.id);
			}
		}
		return eligible;
	}, [issues]);

	const displayedIssues = useMemo(
		() => milestoneFilter ? issues.filter((i) => i.milestone?.title === milestoneFilter) : issues,
		[issues, milestoneFilter]
	);

	if (loading) {
		return (
			<div className="animate-pulse space-y-2 p-4">
				{[...Array(8)].map((_, i) => (
					<div key={i} className="h-10 rounded bg-gray-200" />
				))}
			</div>
		);
	}

	if (error) {
		return (
			<div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
				{error}
			</div>
		);
	}

	if (issues.length === 0) {
		return (
			<div className="rounded border border-github-border bg-white p-12 text-center text-github-fg-muted">
				No issues found in this project.
			</div>
		);
	}

	return (
		<>
			{/* Page header: title + auto-refresh toggle */}
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h2 className="text-xl font-semibold text-github-fg">Project Issues</h2>
					<p className="mt-1 text-sm text-github-fg-muted">A utility tool for RICE scoring your GitHub issues.</p>
				</div>
				<div className="flex items-center gap-2 text-sm text-github-fg-muted">
					<span>Auto-refresh</span>
					<button
						role="switch"
						aria-checked={autoRefresh}
						onClick={() => setAutoRefresh((v) => !v)}
						title={autoRefresh ? "Disable auto-refresh" : "Enable auto-refresh"}
						className={[
							"relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent",
							"transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-github-accent focus:ring-offset-2",
							autoRefresh ? "bg-github-accent" : "bg-gray-300",
						].join(" ")}
					>
						<span
							className={[
								"pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow",
								"transition duration-200 ease-in-out",
								autoRefresh ? "translate-x-4" : "translate-x-0",
							].join(" ")}
						/>
					</button>
				</div>
			</div>

			<div className="space-y-3">
				{/* Active milestone filter banner */}
				{milestoneFilter && (
					<div className="flex items-center gap-2 rounded-md border border-github-border bg-white px-3 py-2 text-sm">
						<span className="text-github-fg-muted">Filtered by milestone:</span>
						<span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-github-fg">
							{milestoneFilter}
						</span>
						<button
							onClick={() => setMilestoneFilter(null)}
							className="ml-auto flex items-center gap-1 rounded text-xs text-github-fg-muted hover:text-github-fg"
						>
							<svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
							</svg>
						Clear filter
						</button>
					</div>
				)}

				<div className="overflow-x-auto rounded-md border border-github-border bg-white">
					<table className="min-w-full divide-y divide-github-border text-sm">
						<thead className="bg-github-canvas">
							<tr>
								<th className="px-4 py-3 text-left font-semibold text-github-fg-muted w-12">#</th>
								<th className="px-4 py-3 text-left font-semibold text-github-fg-muted">Title</th>
								<th className="px-4 py-3 text-left font-semibold text-github-fg-muted w-40">Milestone</th>
								<th className="px-4 py-3 text-left font-semibold text-github-fg-muted w-36">Author</th>
								<th className="px-4 py-3 text-center font-semibold text-github-fg-muted w-24">
									<span title="How many users will this reach?">Reach</span>
								</th>
								<th className="px-4 py-3 text-center font-semibold text-github-fg-muted w-24">
									<span title="How much impact per user?">Impact</span>
								</th>
								<th className="px-4 py-3 text-center font-semibold text-github-fg-muted w-28">
									<span title="How confident are you? (e.g. 0.8 = 80%)">Confidence</span>
								</th>
								<th className="px-4 py-3 text-center font-semibold text-github-fg-muted w-24">
									<span title="Total person-effort required">Effort</span>
								</th>
								<th className="px-4 py-3 text-center font-semibold text-github-fg w-32">
									<span title="(Reach x Impact x Confidence) / Effort">RICE Score</span>
								</th>							<th className="px-2 py-3 w-36" />							</tr>
						</thead>
						<tbody className="divide-y divide-github-border-muted">
							{displayedIssues.map((issue) => {
								const isSaving = savingIssues.has(issue.id);
								const isPropagating = issue.milestone !== null && propagatingMilestones.has(issue.milestone?.title ?? "");
								const isRowBusy = isSaving || isPropagating;
								return (
									<tr
										key={issue.id}
										onFocus={() => { focusedIssueRef.current = issue.id; }}
										onBlur={(e) => {
											if (!e.currentTarget.contains(e.relatedTarget as Node)) {
												focusedIssueRef.current = null;
												handleRowBlur(issue.id);
											}
										}}
										className={[
											"transition-opacity",
											isRowBusy ? "opacity-50" : "",
										].join(" ")}
									>
										<td className="px-4 py-3 text-github-fg-muted font-mono">
											<a
												href={issue.url}
												target="_blank"
												rel="noopener noreferrer"
												className="hover:text-github-accent hover:underline"
											>
												{issue.number}
											</a>
										</td>
										<td className="px-4 py-3">
											<div className="flex items-center gap-2">
												<span
													className={[
														"inline-block h-2 w-2 rounded-full flex-shrink-0",
														issue.state === "OPEN" ? "bg-github-open" : "bg-github-closed",
													].join(" ")}
													title={issue.state}
												/>
												<a
													href={issue.url}
													target="_blank"
													rel="noopener noreferrer"
													className="font-medium text-github-fg hover:text-github-accent hover:underline line-clamp-1"
												>
													{issue.title}
												</a>
											</div>
										</td>
										<td className="px-4 py-3">
											{issue.milestone ? (
												<button
													onClick={() => setMilestoneFilter(
														milestoneFilter === issue.milestone!.title ? null : issue.milestone!.title
													)}
													title={milestoneFilter === issue.milestone.title ? "Clear milestone filter" : `Filter by: ${issue.milestone.title}`}
													className={[
														"block rounded-full border px-2 py-0.5 max-w-40 text-xs transition-colors truncate",
														milestoneFilter === issue.milestone.title
															? "border-github-accent bg-blue-50 text-github-accent"
															: "border-gray-200 bg-gray-100 text-github-fg-muted hover:border-gray-300 hover:bg-gray-200",
													].join(" ")}
												>
													{issue.milestone.title}
												</button>
											) : (
												<span className="text-github-fg-muted">—</span>
											)}
										</td>
										<td className="px-4 py-3">
											{issue.author ? (
												<div className="flex items-center gap-1.5 min-w-0">
													{/* eslint-disable-next-line @next/next/no-img-element */}
													<img
														src={issue.author.avatarUrl}
														alt={issue.author.login}
														className="h-5 w-5 rounded-full flex-shrink-0"
													/>
													<a
														href={`https://github.com/${issue.author.login}`}
														target="_blank"
														rel="noopener noreferrer"
														className="min-w-0 truncate text-xs text-github-fg-muted hover:text-github-accent hover:underline"
													>
														{issue.author.login}
													</a>
												</div>
											) : (
												<span className="text-github-fg-muted">—</span>
											)}
										</td>
										{(["reach", "impact", "confidence", "effort"] as const).map((field) => (
											<td key={field} className="px-4 py-3">
												<ScoreCell
													field={field}
													value={issue.score[field]}
													error={errorCells.has(`${issue.id}:${field}`)}
													onChange={(f, v) => handleFieldChange(issue.id, f, v)}
													onCommit={() => handleFieldCommit(issue.id)}
												/>
											</td>
										))}
										<td className="px-4 py-3 text-center">
											<div className="flex items-center justify-center gap-1.5">
												{(isSaving || isPropagating) && <Spinner className="h-3 w-3 text-github-fg-muted" />}
												{issue.computedScore !== null ? (
													<span className="font-semibold text-github-accent tabular-nums">
														{Math.round(issue.computedScore).toLocaleString()}
													</span>
												) : (
													<span className="text-github-fg-muted">—</span>
												)}
											</div>
										</td>
										<td className="px-2 py-3 text-center">
											{milestonePushEligible.has(issue.id) && (
												<button
													onClick={() => handlePropagate(issue)}
													disabled={isPropagating}
													title="Copy RICE values to all issues with the same milestone"
													className="rounded border border-github-border px-2 py-1 text-xs text-github-fg-muted transition-colors hover:border-github-accent hover:text-github-accent disabled:opacity-40"
												>
													Push to Milestone
												</button>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</div>
			<p className="mt-2 text-right text-xs text-github-fg-muted">Version 0.2.3</p>
		</>
	);
}
