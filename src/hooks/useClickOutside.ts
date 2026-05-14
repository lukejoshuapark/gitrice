import { useEffect, type RefObject } from "react";

/**
 * Fires `callback` whenever a click/mousedown event occurs outside
 * the element referenced by `ref`.
 */
export function useClickOutside<T extends HTMLElement>(
	ref: RefObject<T | null>,
	callback: () => void
): void {
	useEffect(() => {
		function handler(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				callback();
			}
		}
		document.addEventListener("mousedown", handler, true);
		return () => document.removeEventListener("mousedown", handler, true);
	}, [ref, callback]);
}
