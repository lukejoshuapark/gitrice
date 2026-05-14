import { NextRequest, NextResponse } from "next/server";
import { getGitHubClient } from "@/lib/github/client";
import { requireAuth, handleApiError } from "@/lib/api/helpers";

export async function GET(request: NextRequest) {
	const auth = await requireAuth();
	if (auth instanceof NextResponse) return auth;

	const org = request.nextUrl.searchParams.get("org");
	if (!org) {
		return NextResponse.json({ error: "Missing org parameter" }, { status: 400 });
	}

	try {
		const client = getGitHubClient(auth.accessToken);
		const projects = await client.getOrgProjects(org);
		return NextResponse.json(projects, {
			headers: { "Cache-Control": "private, no-store" },
		});
	} catch (err) {
		return handleApiError(err);
	}
}
