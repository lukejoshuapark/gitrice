import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getGitHubClient } from "@/lib/github/client";

export async function GET() {
	const session = await auth();
	if (!session?.accessToken) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const client = getGitHubClient(session.accessToken);
		const orgs = await client.getUserOrgs();
		return NextResponse.json(orgs, {
			headers: { "Cache-Control": "private, no-store" },
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
