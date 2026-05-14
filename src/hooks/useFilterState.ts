import { useCallback, useEffect, useState } from "react";

interface FilterState {
	milestoneFilter: string | null;
	searchQuery: string;
	hideScored: boolean;
}

const DEFAULT_STATE: FilterState = {
	milestoneFilter: null,
	searchQuery: "",
	hideScored: false,
};

function storageKey(org: string, projectId: string) {
	return `gitrice:filters:${org}:${projectId}`;
}

function load(org: string, projectId: string): FilterState {
	try {
		const raw = localStorage.getItem(storageKey(org, projectId));
		if (!raw) return DEFAULT_STATE;
		return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<FilterState>) };
	} catch {
		return DEFAULT_STATE;
	}
}

function save(org: string, projectId: string, state: FilterState) {
	try {
		localStorage.setItem(storageKey(org, projectId), JSON.stringify(state));
	} catch {
		// Ignore storage errors (private browsing, quota, etc.)
	}
}

export function useFilterState(org: string, projectId: string) {
	const [state, setState] = useState<FilterState>(DEFAULT_STATE);

	// Load from localStorage whenever org/project changes.
	useEffect(() => {
		setState(load(org, projectId));
	}, [org, projectId]);

	// Persist whenever state changes.
	useEffect(() => {
		save(org, projectId, state);
	}, [org, projectId, state]);

	const setMilestoneFilter = useCallback((value: string | null) => {
		setState((prev) => ({ ...prev, milestoneFilter: value }));
	}, []);

	const setSearchQuery = useCallback((value: string) => {
		setState((prev) => ({ ...prev, searchQuery: value }));
	}, []);

	const setHideScored = useCallback((value: boolean) => {
		setState((prev) => ({ ...prev, hideScored: value }));
	}, []);

	const clearFilters = useCallback(() => {
		setState((prev) => ({ ...prev, milestoneFilter: null, searchQuery: "", hideScored: false }));
	}, []);

	return {
		milestoneFilter: state.milestoneFilter,
		searchQuery: state.searchQuery,
		hideScored: state.hideScored,
		setMilestoneFilter,
		setSearchQuery,
		setHideScored,
		clearFilters,
	};
}
