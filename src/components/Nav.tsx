"use client";

import { Suspense } from "react";
import { signOut } from "next-auth/react";
import Image from "next/image";
import { OrgPicker } from "./OrgPicker";
import { ProjectPicker } from "./ProjectPicker";

interface NavProps {
	user?: {
		name?: string | null;
		email?: string | null;
		image?: string | null;
	} | null;
}

function NavContent({ user }: NavProps) {
	return (
		<header className="sticky top-0 z-40 bg-github-header border-b border-white/10">
			<div className="mx-auto flex max-w-screen-2xl items-center gap-4 px-4 py-2">
				{/* Logo */}
				<a href="/dashboard" className="flex items-center gap-2 flex-shrink-0">
					<svg height="24" width="24" viewBox="0 0 16 16" fill="white" aria-hidden="true">
						<path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
					</svg>
					<span className="font-semibold text-white text-sm hidden sm:block">GitRice</span>
				</a>

				{/* Org + Project pickers */}
				<div className="flex items-center gap-1 flex-1">
					<OrgPicker />
					<ProjectPicker />
				</div>

				{/* User menu */}
				{user && (
					<div className="flex items-center gap-3 flex-shrink-0">
						{user.image && (
							<Image
								src={user.image}
								alt={user.name ?? "User"}
								width={28}
								height={28}
								className="rounded-full ring-1 ring-white/30"
							/>
						)}
						<button
							onClick={() => signOut({ callbackUrl: "/" })}
							className="text-sm text-github-header-muted hover:text-github-header-text transition-colors"
						>
							Logout
						</button>
					</div>
				)}
			</div>
		</header>
	);
}

export function Nav({ user }: NavProps) {
	// OrgPicker and ProjectPicker use useSearchParams, so they must be wrapped in Suspense
	return (
		<Suspense fallback={
			<header className="sticky top-0 z-40 bg-github-header border-b border-white/10">
				<div className="mx-auto flex max-w-screen-xl items-center gap-4 px-4 py-2 h-12" />
			</header>
		}>
			<NavContent user={user} />
		</Suspense>
	);
}
