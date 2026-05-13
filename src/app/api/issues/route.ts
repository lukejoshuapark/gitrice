import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getGitHubClient } from "@/lib/github/client";
import { getScoreStore } from "@/lib/storage";
import { computeRiceScore } from "@/lib/rice";
import type { IssueWithScore, RiceScore } from "@/types";

const EMPTY_SCORE: RiceScore = { reach: null, impact: null, confidence: null, effort: null };

export async function GET(request: NextRequest) {
	const session = await auth();
	if (!session?.accessToken) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const projectId = request.nextUrl.searchParams.get("projectId");
	const org = request.nextUrl.searchParams.get("org");

	if (!projectId) {
		return NextResponse.json({ error: "Missing projectId parameter" }, { status: 400 });
	}

	try {
		const client = getGitHubClient(session.accessToken);

		const [rawIssues, riceScoreFieldId, scoresData] = await Promise.all([
			client.getProjectItems(projectId),
			client.getProjectRiceFieldId(projectId),
			org ? getScoreStore().getScores(org, projectId) : Promise.resolve({} as Record<string, RiceScore>),
		]);

		const issues: IssueWithScore[] = rawIssues.map((issue) => {
			const score = scoresData[issue.id] ?? { ...EMPTY_SCORE };
			return { ...issue, score, computedScore: computeRiceScore(score) };
		});

		// Sort: highest score first, unscored issues last, then alphabetically within each group.
		issues.sort((a, b) => {
			if (a.computedScore === null && b.computedScore === null) return a.title.localeCompare(b.title);
			if (a.computedScore === null) return 1;
			if (b.computedScore === null) return -1;
			const diff = b.computedScore - a.computedScore;
			return diff !== 0 ? diff : a.title.localeCompare(b.title);
		});

		return NextResponse.json({ issues, riceScoreFieldId }, {
			headers: { "Cache-Control": "no-store" },
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
