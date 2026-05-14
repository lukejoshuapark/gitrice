"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { createPopper } from "@popperjs/core";
import { useClickOutside } from "@/hooks/useClickOutside";

interface RowMenuProps {
	disabled: boolean;
	isPropagating: boolean;
	showPushToMilestone: boolean;
	onPushToMilestone: () => void;
	onReset: () => void;
}

export function RowMenu({
	disabled,
	isPropagating,
	showPushToMilestone,
	onPushToMilestone,
	onReset,
}: RowMenuProps) {
	const [open, setOpen] = useState(false);
	const btnRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	// Position the menu with Popper whenever it opens.
	useEffect(() => {
		if (!open || !btnRef.current || !menuRef.current) return;
		const popper = createPopper(btnRef.current, menuRef.current, {
			placement: "bottom-end",
			modifiers: [{ name: "offset", options: { offset: [0, 4] } }],
		});
		return () => popper.destroy();
	}, [open]);

	const close = useCallback(() => setOpen(false), []);
	useClickOutside(menuRef, close);

	return (
		<>
			<button
				ref={btnRef}
				onClick={() => setOpen((v) => !v)}
				disabled={disabled}
				title="More actions"
				className="rounded p-1 text-github-fg-muted transition-colors hover:bg-gray-100 hover:text-github-fg disabled:opacity-40"
			>
				<svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
					<circle cx="8" cy="2" r="1.5" />
					<circle cx="8" cy="8" r="1.5" />
					<circle cx="8" cy="14" r="1.5" />
				</svg>
			</button>
			{open &&
				createPortal(
					<div
						ref={menuRef}
						className="z-50 w-44 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
					>
						{showPushToMilestone && (
							<button
								onClick={() => {
									onPushToMilestone();
									setOpen(false);
								}}
								disabled={isPropagating}
								className="flex w-full items-center px-3 py-1.5 text-left text-xs text-github-fg hover:bg-gray-50 disabled:opacity-40"
							>
								Push to Milestone
							</button>
						)}
						<button
							onClick={() => {
								onReset();
								setOpen(false);
							}}
							disabled={disabled}
							className="flex w-full items-center px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
						>
							Reset
						</button>
					</div>,
					document.body
				)}
		</>
	);
}
