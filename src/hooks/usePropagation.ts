import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { issuesQueryKey } from "./useIssues";
import type { IssueWithScore, RiceScore } from "@/types";

interface PropagationOptions {
	org: string;
	projectId: string;
	riceScoreFieldId: string | null;
	issues: IssueWithScore[];
	markPropagating: (ids: string[]) => void;
	unmarkPropagating: (ids: string[]) => void;
}

export function usePropagation({
	org,
	projectId,
	riceScoreFieldId,
	issues,
	markPropagating,
	unmarkPropagating,
}: PropagationOptions) {
	const [propagatingMilestones, setPropagatingMilestones] = useState<Set<string>>(new Set());
	const queryClient = useQueryClient();

	const handlePropagate = useCallback(
		async (sourceIssue: IssueWithScore) => {
			if (!sourceIssue.milestone) return;
			const milestoneTitle = sourceIssue.milestone.title;

			const targetItems = issues
				.filter((i) => i.milestone?.title === milestoneTitle && i.id !== sourceIssue.id)
				.map((i) => ({ issueId: i.id, itemId: i.projectItemId }));

			if (targetItems.length === 0) return;

			const targetIds = targetItems.map((t) => t.issueId);
			markPropagating(targetIds);
			setPropagatingMilestones((prev) => new Set([...prev, milestoneTitle]));

			let propagated = false;
			try {
				const body: {
					org: string;
					projectId: string;
					score: RiceScore;
					items: { issueId: string; itemId: string }[];
					fieldId?: string;
				} = { org, projectId, score: sourceIssue.score, items: targetItems };
				if (riceScoreFieldId) body.fieldId = riceScoreFieldId;

				const res = await fetch("/api/scores/propagate", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				});
				if (!res.ok) throw new Error("Failed to propagate scores");
				propagated = true;
			} catch (err) {
				console.error("Propagate failed:", err);
			} finally {
				unmarkPropagating(targetIds);
				setPropagatingMilestones((prev) => {
					const next = new Set(prev);
					next.delete(milestoneTitle);
					return next;
				});
			}

			if (propagated) {
				await queryClient.invalidateQueries({
					queryKey: issuesQueryKey(org, projectId),
				});
			}
		},
		[org, projectId, riceScoreFieldId, issues, markPropagating, unmarkPropagating, queryClient]
	);

	return { propagatingMilestones, handlePropagate };
}
