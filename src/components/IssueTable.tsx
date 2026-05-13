"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScoreCell } from "./ScoreCell";
import { computeRiceScore } from "@/lib/rice";
import type { GitHubIssue, IssueWithScore, RiceScore } from "@/types";

interface IssueTableProps {
	org: string;
	projectId: string;
}

const EMPTY_SCORE: RiceScore = { reach: null, impact: null, confidence: null, effort: null };

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
	// Stable ref so flushSave closure always sees current issue metadata.
	const issueMetaRef = useRef<Map<string, { projectItemId: string }>>(new Map());

	const riceScoreFieldIdRef = useRef<string | null>(null);
	riceScoreFieldIdRef.current = riceScoreFieldId;
	const lastActivityRef = useRef(Date.now());
	const loadingRef = useRef(false);

	const fetchData = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
		if (silent && loadingRef.current) return;
		if (!silent) {
			setLoading(true);
			loadingRef.current = true;
		}
		setError(null);
		try {
			const [issuesRes, scoresRes] = await Promise.all([
				fetch(`/api/issues?projectId=${encodeURIComponent(projectId)}`),
				fetch(`/api/scores?org=${encodeURIComponent(org)}&projectId=${encodeURIComponent(projectId)}`),
			]);

			if (!issuesRes.ok) throw new Error("Failed to load issues");
			if (!scoresRes.ok) throw new Error("Failed to load scores");

			// /api/issues now returns { issues, riceScoreFieldId } in one response,
			// eliminating the separate /api/projects/fields round-trip.
			const { issues: rawIssues, riceScoreFieldId: fieldId } =
				await issuesRes.json() as { issues: GitHubIssue[]; riceScoreFieldId: string | null };
			const scoresData = await scoresRes.json() as Record<string, RiceScore>;

			setRiceScoreFieldId(fieldId);

			const merged: IssueWithScore[] = rawIssues.map((issue) => {
				const score = scoresData[issue.id] ?? { ...EMPTY_SCORE };
				return { ...issue, score, computedScore: computeRiceScore(score) };
			});

			if (silent) {
				// Don't overwrite rows that have in-flight edits.
				setIssues((prev) => {
					const prevMap = new Map(prev.map((i) => [i.id, i]));
					return merged.map((m) =>
						(pendingUpdates.current.has(m.id) || debounceTimers.current.has(m.id))
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
		} catch {
			setErrorCells((prev) => {
				const next = new Set(prev);
				for (const field of Object.keys(updates)) {
					next.add(`${issueId}:${field}`);
				}
				return next;
			});
		} finally {
			setSavingIssues((prev) => {
				const next = new Set(prev);
				next.delete(issueId);
				return next;
			});
		}
	}, [org, projectId]);

	/** Called by ScoreCell on every keystroke — optimistic UI update only; save is deferred to row-blur. */
	const handleFieldChange = useCallback((issueId: string, field: keyof RiceScore, value: number | null) => {
		setIssues((prev) =>
			prev.map((issue) => {
				if (issue.id !== issueId) return issue;
				const updatedScore = { ...issue.score, [field]: value };
				return { ...issue, score: updatedScore, computedScore: computeRiceScore(updatedScore) };
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
		setPropagatingMilestones((prev) => new Set([...prev, milestoneTitle]));
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
			setIssues((prev) =>
				prev.map((issue) => {
					if (!targetIds.includes(issue.id)) return issue;
					return { ...issue, score: sourceIssue.score, computedScore: computeRiceScore(sourceIssue.score) };
				})
			);
		} catch (err) {
			console.error("Propagate failed:", err);
		} finally {
			setPropagatingMilestones((prev) => {
				const next = new Set(prev);
				next.delete(milestoneTitle);
				return next;
			});
		}
	}, [issues, org, projectId, riceScoreFieldId]);

	const displayedIssues = useMemo(() => {
		let list = [...issues];
		if (milestoneFilter) {
			list = list.filter((i) => i.milestone?.title === milestoneFilter);
		}
		return list.sort((a, b) => {
			if (a.computedScore === null && b.computedScore === null) return a.title.localeCompare(b.title);
			if (a.computedScore === null) return 1;
			if (b.computedScore === null) return -1;
			const scoreDiff = b.computedScore - a.computedScore;
			return scoreDiff !== 0 ? scoreDiff : a.title.localeCompare(b.title);
		});
	}, [issues, milestoneFilter]);

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
								</th>							<th className="px-2 py-3 w-10" />							</tr>
						</thead>
						<tbody className="divide-y divide-github-border-muted">
							{displayedIssues.map((issue) => {
								const isSaving = savingIssues.has(issue.id);
								const isPropagating = issue.milestone !== null && propagatingMilestones.has(issue.milestone?.title ?? "");
								const isRowBusy = isSaving || isPropagating;
								return (
									<tr
										key={issue.id}
										onBlur={(e) => {
											if (!e.currentTarget.contains(e.relatedTarget as Node)) {
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
											{issue.computedScore !== null && (
												<button
													onClick={() => handlePropagate(issue)}
													disabled={isPropagating}
													title="Copy RICE values to all issues with the same milestone"
													className="rounded p-1 text-lg leading-none transition-colors hover:bg-github-canvas-subtle disabled:opacity-40"
												>
												🪧
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
		</>
	);
}
