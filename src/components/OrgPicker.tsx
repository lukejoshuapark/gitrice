"use client";
import clsx from "clsx";

import { useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useClickOutside } from "@/hooks/useClickOutside";
import type { GitHubOrg } from "@/types";

async function fetchOrgs(): Promise<GitHubOrg[]> {
	const res = await fetch("/api/orgs");
	if (!res.ok) throw new Error("Failed to load organisations");
	return res.json() as Promise<GitHubOrg[]>;
}

export function OrgPicker() {
	const [open, setOpen] = useState(false);
	const searchParams = useSearchParams();
	const router = useRouter();
	const dropdownRef = useRef<HTMLDivElement>(null);

	const currentOrg = searchParams.get("org");

	const { data: orgs = [], isLoading } = useQuery({
		queryKey: ["orgs"],
		queryFn: fetchOrgs,
		staleTime: 5 * 60 * 1000,
	});

	const close = useCallback(() => setOpen(false), []);
	useClickOutside(dropdownRef, close);

	function selectOrg(login: string) {
		const params = new URLSearchParams();
		params.set("org", login);
		router.push(`/dashboard?${params.toString()}`);
		setOpen(false);
	}

	const selectedOrg = orgs.find((o) => o.login === currentOrg);

	return (
		<div ref={dropdownRef} className="relative">
			<button
				onClick={() => setOpen((v) => !v)}
				disabled={isLoading}
				className="flex items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-github-header-text hover:bg-white/20 disabled:opacity-50 transition-colors"
				aria-label="Select organisation"
				aria-haspopup="listbox"
				aria-expanded={open}
			>
				{isLoading ? (
					<span className="text-github-header-muted">Loading…</span>
				) : selectedOrg ? (
					<>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={selectedOrg.avatarUrl} alt="" className="h-4 w-4 rounded-full" />
						<span>{selectedOrg.login}</span>
					</>
				) : (
					<span className="text-github-header-muted">Select organisation</span>
				)}
				<svg className="h-4 w-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
				</svg>
			</button>

			{open && (
				<div className="absolute left-0 top-full z-50 mt-1 min-w-48 overflow-hidden rounded-md border border-github-border bg-white shadow-lg">
					{orgs.length === 0 ? (
						<p className="px-4 py-3 text-sm text-github-fg-muted">No organisations found</p>
					) : (
						<ul role="listbox" className="max-h-64 overflow-y-auto py-1">
							{orgs.map((org) => (
								<li key={org.login}>
									<button
										role="option"
										aria-selected={org.login === currentOrg}
										onClick={() => selectOrg(org.login)}
										className={clsx(
											"flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-github-canvas",
											org.login === currentOrg ? "font-semibold text-github-accent" : "text-github-fg",
										)}
									>
										{/* eslint-disable-next-line @next/next/no-img-element */}
										<img src={org.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
										{org.login}
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
