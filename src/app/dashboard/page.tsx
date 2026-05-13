import { Suspense } from "react";
import { auth } from "@/auth";
import { IssueTable } from "@/components/IssueTable";

interface DashboardPageProps {
	searchParams: Promise<{ org?: string; project?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
	await auth(); // Auth check handled by middleware, but keep for SSR safety
	const params = await searchParams;
	const org = params.org ?? null;
	const projectId = params.project ?? null;

	return (
		<main className="mx-auto max-w-screen-2xl px-4 py-6">
			{/* Page heading — only shown when no project is selected; IssueTable owns the heading when a project is active */}
			{!(org && projectId) && (
				<div className="mb-6">
					<h2 className="text-xl font-semibold text-github-fg">
						{org ? "Select a project" : "Select an organisation and project"}
					</h2>
				</div>
			)}

			{/* Issue table */}
			{org && projectId ? (
				<Suspense fallback={
					<div className="animate-pulse space-y-2">
						{[...Array(8)].map((_, i) => (
							<div key={i} className="h-10 rounded bg-gray-200" />
						))}
					</div>
				}>
					<IssueTable org={org} projectId={projectId} />
				</Suspense>
			) : (
				<div className="flex flex-col items-center justify-center rounded-md border border-dashed border-github-border bg-white py-20 text-center">
					<svg className="mb-4 h-10 w-10 text-github-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
					</svg>
					<p className="text-github-fg-muted text-sm">
						{!org
							? "Select an organisation from the top bar to get started."
							: "Select a project from the top bar to view its issues."}
					</p>
				</div>
			)}
		</main>
	);
}
