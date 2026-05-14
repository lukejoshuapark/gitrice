import { NextRequest, NextResponse } from "next/server";
import { getScoreStore } from "@/lib/storage";
import { getGitHubClient } from "@/lib/github/client";
import { computeRiceScore } from "@/lib/rice";
import {
	requireAuth,
	requireOrgMember,
	validateRiceScore,
	syncScoreToGitHub,
	handleApiError,
} from "@/lib/api/helpers";
import type { RiceScore } from "@/types";

export async function GET(request: NextRequest) {
	const auth = await requireAuth();
	if (auth instanceof NextResponse) return auth;

	const org = request.nextUrl.searchParams.get("org");
	const projectId = request.nextUrl.searchParams.get("projectId");

	if (!org || !projectId) {
		return NextResponse.json({ error: "Missing org or projectId parameter" }, { status: 400 });
	}

	const client = getGitHubClient(auth.accessToken);
	const forbidden = await requireOrgMember(client, org);
	if (forbidden) return forbidden;

	try {
		const store = getScoreStore();
		const scores = await store.getScores(org, projectId);
		return NextResponse.json(scores, {
			headers: { "Cache-Control": "no-store" },
		});
	} catch (err) {
		return handleApiError(err);
	}
}

export async function PUT(request: NextRequest) {
	const auth = await requireAuth();
	if (auth instanceof NextResponse) return auth;

	const org = request.nextUrl.searchParams.get("org");
	const projectId = request.nextUrl.searchParams.get("projectId");
	const issueId = request.nextUrl.searchParams.get("issueId");
	const projectItemId = request.nextUrl.searchParams.get("projectItemId");
	const fieldId = request.nextUrl.searchParams.get("fieldId");

	if (!org || !projectId || !issueId) {
		return NextResponse.json({ error: "Missing org, projectId, or issueId parameter" }, { status: 400 });
	}

	const client = getGitHubClient(auth.accessToken);
	const forbidden = await requireOrgMember(client, org);
	if (forbidden) return forbidden;

	let body: Partial<RiceScore>;
	try {
		body = await request.json() as Partial<RiceScore>;
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const invalid = validateRiceScore(body);
	if (invalid) return invalid;

	try {
		const store = getScoreStore();
		const merged = await store.setScore(org, projectId, issueId, body);

		if (projectItemId && fieldId) {
			await syncScoreToGitHub(client, { projectId, projectItemId, fieldId, merged });
		}

		return NextResponse.json({ score: merged, computedScore: computeRiceScore(merged) });
	} catch (err) {
		return handleApiError(err);
	}
}
