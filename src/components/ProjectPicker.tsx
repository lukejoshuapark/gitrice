"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { GitHubProject } from "@/types";

export function ProjectPicker() {
	const [projects, setProjects] = useState<GitHubProject[]>([]);
	const [loading, setLoading] = useState(false);
	const [open, setOpen] = useState(false);
	const searchParams = useSearchParams();
	const router = useRouter();
	const dropdownRef = useRef<HTMLDivElement>(null);

	const currentOrg = searchParams.get("org");
	const currentProjectId = searchParams.get("project");

	useEffect(() => {
		if (!currentOrg) {
			setProjects([]);
			return;
		}
		setLoading(true);
		fetch(`/api/projects?org=${encodeURIComponent(currentOrg)}`)
			.then((r) => r.json())
			.then((data: GitHubProject[]) => {
				setProjects(data);
				setLoading(false);
			})
			.catch(() => setLoading(false));
	}, [currentOrg]);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	function selectProject(project: GitHubProject) {
		const params = new URLSearchParams(searchParams.toString());
		params.set("project", project.id);
		router.push(`/dashboard?${params.toString()}`);
		setOpen(false);
	}

	const selectedProject = projects.find((p) => p.id === currentProjectId);

	if (!currentOrg) return null;

	return (
		<div ref={dropdownRef} className="relative flex items-center gap-1">
			<span className="text-github-header-muted text-sm">/</span>
			<button
				onClick={() => setOpen((v) => !v)}
				disabled={loading}
				className="flex items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-github-header-text hover:bg-white/20 disabled:opacity-50 transition-colors"
				aria-label="Select project"
				aria-haspopup="listbox"
				aria-expanded={open}
			>
				{loading ? (
					<span className="text-github-header-muted">Loading…</span>
				) : selectedProject ? (
					<span>{selectedProject.title}</span>
				) : (
					<span className="text-github-header-muted">Select project</span>
				)}
				<svg className="h-4 w-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
				</svg>
			</button>

			{open && (
				<div className="absolute left-6 top-full z-50 mt-1 min-w-56 overflow-hidden rounded-md border border-github-border bg-white shadow-lg">
					{projects.length === 0 ? (
						<p className="px-4 py-3 text-sm text-github-fg-muted">No projects found</p>
					) : (
						<ul role="listbox" className="max-h-64 overflow-y-auto py-1">
							{projects
								.filter((p) => !p.closed)
								.map((project) => (
									<li key={project.id}>
										<button
											role="option"
											aria-selected={project.id === currentProjectId}
											onClick={() => selectProject(project)}
											className={[
												"flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm hover:bg-github-canvas",
												project.id === currentProjectId ? "font-semibold text-github-accent" : "text-github-fg",
											].join(" ")}
										>
											<span>{project.title}</span>
											<span className="text-xs text-github-fg-muted">#{project.number}</span>
										</button>
									</li>
								))}
						</ul>
					)}
				</div>
			)}
		</div>
	);
}
