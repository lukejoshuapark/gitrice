"use client";
import clsx from "clsx";

import { useEffect, useState } from "react";
import type { RiceScore } from "@/types";

interface ScoreCellProps {
	field: keyof RiceScore;
	value: number | null;
	error: boolean;
	onChange: (field: keyof RiceScore, value: number | null) => void;
	onCommit: (field: keyof RiceScore) => void;
}

export function ScoreCell({ field, value, error, onChange, onCommit }: ScoreCellProps) {
	const [localValue, setLocalValue] = useState<string>(value !== null ? String(value) : "");

	// Sync when parent value changes (e.g. initial load or propagate)
	useEffect(() => {
		setLocalValue(value !== null ? String(value) : "");
	}, [value]);

	function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
		const raw = e.target.value;
		setLocalValue(raw);
		const parsed = raw.trim() === "" ? null : parseFloat(raw);
		if (parsed !== null && isNaN(parsed)) return;
		onChange(field, parsed);
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter") onCommit(field);
	}

	const inputLabel = field.charAt(0).toUpperCase() + field.slice(1);

	return (
		<div className="flex items-center justify-center">
			<input
				type="text"
				inputMode="decimal"
				value={localValue}
				onChange={handleChange}

				onKeyDown={handleKeyDown}
				aria-label={`${inputLabel} for issue`}
				placeholder="—"
				className={clsx(
					"w-20 rounded border px-2 py-1 text-right text-sm",
					"focus:outline-none focus:ring-1",
					error
						? "border-github-danger bg-red-50 focus:ring-github-danger"
						: "border-github-border bg-white focus:border-github-accent focus:ring-github-accent",
				)}
			/>
		</div>
	);
}
