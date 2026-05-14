import clsx from "clsx";

// r=5, circumference = 2π×5 ≈ 31.42 — must match the CSS keyframe in globals.css
const RING_R = 5;
const RING_C = 2 * Math.PI * RING_R;

function CountdownRing({
	interval,
	fetchKey,
	active,
	isFetching,
}: {
	interval: number;
	fetchKey: number;
	active: boolean;
	isFetching: boolean;
}) {
	const fetching = active && isFetching;
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 12 12"
			className={clsx("-rotate-90", fetching && "animate-pulse")}
			aria-label={active ? (fetching ? "Refreshing…" : `Next refresh in ~${Math.round(interval / 1000)}s`) : "Auto-refresh paused"}
		>
			{/* Dim track */}
			<circle cx="6" cy="6" r={RING_R} fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-20" />
			{/* Animated arc — remounts (via key) after each successful fetch to restart the animation.
			     While fetching, the animation style is removed so the arc holds at strokeDashoffset=0 (full)
			     and the SVG pulses to indicate the request is in-flight. */}
			<circle
				key={active ? fetchKey : 0}
				cx="6"
				cy="6"
				r={RING_R}
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeDasharray={RING_C}
				strokeDashoffset={active ? 0 : RING_C}
				style={active && !fetching ? { animation: `gitrice-countdown ${interval}ms linear forwards` } : undefined}
			/>
		</svg>
	);
}

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
	fetchKey: number;
	isFetching: boolean;
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
	fetchKey,
	isFetching,
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
					<CountdownRing interval={refreshInterval} fetchKey={fetchKey} active={autoRefresh} isFetching={isFetching} />
					<span className="text-sm">Auto-refresh</span>
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
