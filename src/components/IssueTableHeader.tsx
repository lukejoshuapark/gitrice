import clsx from "clsx";

interface IssueTableHeaderProps {
	milestones: string[];
	milestoneFilter: string | null;
	onMilestoneFilterChange: (value: string | null) => void;
	searchQuery: string;
	onSearchQueryChange: (value: string) => void;
	hideScored: boolean;
	onHideScoredChange: (value: boolean) => void;
	autoRefresh: boolean;
	refreshInterval: number;
	onAutoRefreshToggle: () => void;
}

export function IssueTableHeader({
	milestones,
	milestoneFilter,
	onMilestoneFilterChange,
	searchQuery,
	onSearchQueryChange,
	hideScored,
	onHideScoredChange,
	autoRefresh,
	refreshInterval,
	onAutoRefreshToggle,
}: IssueTableHeaderProps) {
	return (
		<div className="mb-6 flex items-center justify-between">
			<div>
				<h2 className="text-xl font-semibold text-github-fg">Project Issues</h2>
				<p className="mt-1 text-sm text-github-fg-muted">
					A utility tool for RICE scoring your GitHub issues.
				</p>
			</div>
			<div className="flex items-center gap-6 text-sm text-github-fg-muted">
				<div className="relative">
					<svg
						className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-github-fg-muted"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={2}
						aria-hidden="true"
					>
						<path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
					</svg>
					<input
						type="search"
						value={searchQuery}
						onChange={(e) => onSearchQueryChange(e.target.value)}
						placeholder="Search"
						className="w-44 rounded border border-github-border bg-white py-1 pl-7 pr-2 text-xs text-github-fg placeholder-github-fg-muted focus:border-github-accent focus:outline-none focus:ring-1 focus:ring-github-accent"
					/>
				</div>
				{milestones.length > 0 && (
					<select
						value={milestoneFilter ?? ""}
						onChange={(e) => onMilestoneFilterChange(e.target.value || null)}
						className="rounded border border-github-border bg-white px-2 py-1 text-xs text-github-fg focus:border-github-accent focus:outline-none"
					>
						<option value="">All milestones</option>
						{milestones.map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
					</select>
				)}
				<label className="flex cursor-pointer items-center gap-1.5">
					<input
						type="checkbox"
						checked={hideScored}
						onChange={(e) => onHideScoredChange(e.target.checked)}
						className="h-3.5 w-3.5 rounded border-github-border accent-github-accent"
					/>
					<span className="text-xs">Hide scored</span>
				</label>
				<div className="flex items-center gap-2">
					<span>Auto-refresh ({Math.round(refreshInterval / 1_000)}s)</span>
					<button
						role="switch"
						aria-checked={autoRefresh}
						onClick={onAutoRefreshToggle}
						title={autoRefresh ? "Disable auto-refresh" : "Enable auto-refresh"}
						className={clsx(
							"relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent",
							"transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-github-accent focus:ring-offset-2",
							autoRefresh ? "bg-github-accent" : "bg-gray-300",
						)}
					>
						<span
							className={clsx(
								"pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow",
								"transition duration-200 ease-in-out",
								autoRefresh ? "translate-x-4" : "translate-x-0",
							)}
						/>
					</button>
				</div>
			</div>
		</div>
	);
}
