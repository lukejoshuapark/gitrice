import { NextResponse } from "next/server";
import { getGitHubClient } from "@/lib/github/client";
import { requireAuth, handleApiError } from "@/lib/api/helpers";

export async function GET() {
	const auth = await requireAuth();
	if (auth instanceof NextResponse) return auth;

	try {
		const client = getGitHubClient(auth.accessToken);
		const orgs = await client.getUserOrgs();
		return NextResponse.json(orgs, {
			headers: { "Cache-Control": "private, no-store" },
		});
	} catch (err) {
		return handleApiError(err);
	}
}
