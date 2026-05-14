import clsx from "clsx";

interface IssueTableHeaderProps {
	milestones: string[];
	milestoneFilter: string | null;
	onMilestoneFilterChange: (value: string | null) => void;
	autoRefresh: boolean;
	refreshInterval: number;
	onAutoRefreshToggle: () => void;
}

export function IssueTableHeader({
	milestones,
	milestoneFilter,
	onMilestoneFilterChange,
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
