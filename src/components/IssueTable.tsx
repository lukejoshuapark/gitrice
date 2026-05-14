"use client";
import clsx from "clsx";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScoreCell } from "./ScoreCell";
import { Spinner } from "./Spinner";
import { RowMenu } from "./RowMenu";
import { IssueTableHeader } from "./IssueTableHeader";
import { useIssues } from "@/hooks/useIssues";
import { useSaveManager } from "@/hooks/useSaveManager";
import { usePropagation } from "@/hooks/usePropagation";
import { useFilterState } from "@/hooks/useFilterState";
import type { IssueWithScore, RiceScore } from "@/types";

interface IssueTableProps {
	org: string;
	projectId: string;
}

export function IssueTable({ org, projectId }: IssueTableProps) {
	const [issues, setIssues] = useState<IssueWithScore[]>([]);
	const [autoRefresh, setAutoRefresh] = useState(true);

	const {
		milestoneFilter,
		searchQuery,
		hideScored,
		setMilestoneFilter,
		setSearchQuery,
		setHideScored,
		clearFilters,
	} = useFilterState(org, projectId);

	const riceScoreFieldIdRef = useRef<string | null>(null);

	// onIssueUpdated: optimistically applies server response to local state.
	const onIssueUpdated = useCallback(
		(issueId: string, score: RiceScore, computedScore: number | null) => {
			setIssues((prev) =>
				prev.map((i) => (i.id === issueId ? { ...i, score, computedScore } : i))
			);
		},
		[]
	);

	const saveManager = useSaveManager({
		org,
		projectId,
		riceScoreFieldIdRef,
		onIssueUpdated,
	});

	const { issues: fetchedIssues, riceScoreFieldId, isLoading, error, refreshInterval, dataUpdatedAt, resetAndRefetch } = useIssues({
		org,
		projectId,
		autoRefresh,
	});

	// Sync fetched issues into local state, protecting any rows that are currently busy
	// (focused / pending save) so background polls never wipe the user's in-progress edits.
	const { getBusyIds } = saveManager;
	useEffect(() => {
		setIssues((prev) => {
			const busy = getBusyIds();
			if (busy.size === 0) return fetchedIssues;
			const prevMap = new Map(prev.map((i) => [i.id, i]));
			return fetchedIssues.map((i) => (busy.has(i.id) ? (prevMap.get(i.id) ?? i) : i));
		});
	}, [fetchedIssues, getBusyIds]);

	useEffect(() => {
		riceScoreFieldIdRef.current = riceScoreFieldId;
	}, [riceScoreFieldId]);

	// Keep issue metadata (projectItemId) current for save/reset operations.
	useEffect(() => {
		saveManager.syncIssueMeta(issues);
	}, [issues, saveManager]);

	// Reset milestone filter and search when org/project changes.
	// (useFilterState already loads saved state for the new key, so no manual reset needed.)

	const { propagatingMilestones, handlePropagate } = usePropagation({
		org,
		projectId,
		riceScoreFieldId,
		issues,
		markPropagating: saveManager.markPropagating,
		unmarkPropagating: saveManager.unmarkPropagating,
	});

	// handleFieldChange also updates local state optimistically.
	const handleFieldChange = useCallback(
		(issueId: string, field: keyof RiceScore, value: number | null) => {
			setIssues((prev) =>
				prev.map((issue) =>
					issue.id === issueId
						? { ...issue, score: { ...issue.score, [field]: value } }
						: issue
				)
			);
			saveManager.handleFieldChange(issueId, field, value);
		},
		[saveManager]
	);

	// Issues where "Push to Milestone" should appear.
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

	const displayedIssues = useMemo(() => {
		let result = milestoneFilter
			? issues.filter((i) => i.milestone?.title === milestoneFilter)
			: issues;
		const q = searchQuery.trim().toLowerCase();
		if (q) {
			result = result.filter(
				(i) =>
					i.title.toLowerCase().includes(q) ||
					(i.author?.login ?? "").toLowerCase().includes(q) ||
					String(i.number).includes(q),
			);
		}
		if (hideScored) {
			result = result.filter((i) => i.computedScore === null);
		}
		return result;
	}, [issues, milestoneFilter, searchQuery, hideScored]);

	const milestones = useMemo(() => {
		const seen = new Set<string>();
		const result: string[] = [];
		for (const issue of issues) {
			if (issue.milestone && !seen.has(issue.milestone.title)) {
				seen.add(issue.milestone.title);
				result.push(issue.milestone.title);
			}
		}
		return result.sort();
	}, [issues]);

	if (isLoading) {
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
			<IssueTableHeader
				milestones={milestones}
				milestoneFilter={milestoneFilter}
				onMilestoneFilterChange={setMilestoneFilter}
				searchQuery={searchQuery}
				onSearchQueryChange={setSearchQuery}
				hideScored={hideScored}
				onHideScoredChange={setHideScored}
				autoRefresh={autoRefresh}
				refreshInterval={refreshInterval}
				fetchKey={dataUpdatedAt}
				onAutoRefreshToggle={() => {
					const enabling = !autoRefresh;
					setAutoRefresh(enabling);
					if (enabling) resetAndRefetch();
				}}
			/>

			<div className="space-y-3">
				{(milestoneFilter || searchQuery || hideScored) && (
					<div className="flex items-center gap-2 rounded-md border border-github-border bg-white px-3 py-2 text-sm">
						{milestoneFilter && (
							<>
								<span className="text-github-fg-muted">Milestone:</span>
								<span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-github-fg">
									{milestoneFilter}
								</span>
							</>
						)}
						{searchQuery && (
							<>
								{milestoneFilter && <span className="text-github-border">·</span>}
								<span className="text-github-fg-muted">Search:</span>
								<span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-github-fg">
									{searchQuery}
								</span>
							</>
						)}
						{hideScored && (
							<>
								{(milestoneFilter || searchQuery) && <span className="text-github-border">·</span>}
								<span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-github-fg">
									Hide scored
								</span>
							</>
						)}
						<button
							onClick={clearFilters}
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
					{displayedIssues.length === 0 ? (
						<div className="flex flex-col items-center gap-2 py-16 text-github-fg-muted">
							<svg className="h-8 w-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
							</svg>
							<p className="text-sm font-medium">No issues match the active filters</p>
							<button onClick={clearFilters} className="mt-1 text-xs text-github-accent hover:underline">
								Clear all filters
							</button>
						</div>
					) : (
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
									</th>
									<th className="px-2 py-3 w-10" />
								</tr>
							</thead>
							<tbody className="divide-y divide-github-border-muted">
								{displayedIssues.map((issue) => {
									const isSaving = saveManager.savingIssues.has(issue.id);
									const isPropagating =
									issue.milestone !== null &&
									propagatingMilestones.has(issue.milestone?.title ?? "");
									const isRowBusy = isSaving || isPropagating;

									return (
										<tr
											key={issue.id}
											onFocus={() => {
												saveManager.focusedIssueRef.current = issue.id;
											}}
											onBlur={(e) => {
												if (!e.currentTarget.contains(e.relatedTarget as Node)) {
													saveManager.focusedIssueRef.current = null;
													saveManager.handleRowBlur(issue.id);
												}
											}}
											className={[
												"transition-opacity",
												isRowBusy ? "opacity-50" : "",
												issue.id === saveManager.lastSavedIssueId
													? "outline outline-2 outline-github-accent"
													: "",
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
														onClick={() =>
															setMilestoneFilter(
																milestoneFilter === issue.milestone!.title
																	? null
																	: issue.milestone!.title
															)
														}
														title={
															milestoneFilter === issue.milestone.title
																? "Clear milestone filter"
																: `Filter by: ${issue.milestone.title}`
														}
														className={clsx(
															"block rounded-full border px-2 py-0.5 max-w-40 text-xs transition-colors truncate",
															milestoneFilter === issue.milestone.title
																? "border-github-accent bg-blue-50 text-github-accent"
																: "border-gray-200 bg-gray-100 text-github-fg-muted hover:border-gray-300 hover:bg-gray-200",
														)}
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
														error={saveManager.errorCells.has(`${issue.id}:${field}`)}
														onChange={(f, v) => handleFieldChange(issue.id, f, v)}
														onCommit={() => saveManager.handleFieldCommit(issue.id)}
													/>
												</td>
											))}
											<td className="px-4 py-3 text-center">
												<div className="flex items-center justify-center gap-1.5">
													{(isSaving || isPropagating) && (
														<Spinner className="h-3 w-3 text-github-fg-muted" />
													)}
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
													<RowMenu
														disabled={isRowBusy}
														isPropagating={isPropagating}
														showPushToMilestone={milestonePushEligible.has(issue.id)}
														onPushToMilestone={() => void handlePropagate(issue)}
														onReset={() => void saveManager.handleReset(issue.id)}
													/>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					)}
				</div>
			</div>
			<p className="mt-2 text-right text-xs text-github-fg-muted">Version 1.5.4</p>
		</>
	);
}
