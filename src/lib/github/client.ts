import type { GitHubIssue, GitHubOrg, GitHubProject } from "@/types";
import {
	LIST_ORG_PROJECTS,
	LIST_PROJECT_ITEMS,
	GET_PROJECT_FIELDS,
	UPDATE_PROJECT_ITEM_SCORE,
	CLEAR_PROJECT_ITEM_SCORE,
	buildBatchUpdateMutation,
} from "./queries";

const REST_URL = "https://api.github.com";
const GRAPHQL_URL = "https://api.github.com/graphql";

interface OrgProjectsResponse {
	organization: {
		projectsV2: {
			pageInfo: { hasNextPage: boolean; endCursor: string };
			nodes: { id: string; number: number; title: string; closed: boolean }[];
		};
	};
}

interface ProjectItemContent {
	__typename?: string;
	id?: string;
	number?: number;
	title: string;
	state?: string;
	url?: string;
	author?: { login: string; avatarUrl: string } | null;
	milestone?: { title: string; number: number } | null;
	assignees?: { nodes: { login: string; avatarUrl: string }[] };
}

interface ProjectItemsResponse {
	node: {
		items: {
			pageInfo: { hasNextPage: boolean; endCursor: string };
			nodes: { id: string; content: ProjectItemContent | null }[];
		};
	};
}

interface ProjectFieldsResponse {
	node: {
		fields: {
			pageInfo: { hasNextPage: boolean; endCursor: string };
			nodes: { id?: string; name?: string; dataType?: string }[];
		};
	};
}

/** Parses the `rel="next"` URL out of a GitHub `Link` response header. */
function parseNextLink(linkHeader: string | null): string | null {
	if (!linkHeader) return null;
	const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
	return match ? match[1] : null;
}

export function getGitHubClient(accessToken: string) {
	const baseHeaders = {
		"Authorization": `Bearer ${accessToken}`,
		"Accept": "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
	};

	function checkRateLimit(headers: Headers): void {
		const remaining = headers.get("X-RateLimit-Remaining");
		if (remaining !== null && parseInt(remaining, 10) < 10) {
			const reset = headers.get("X-RateLimit-Reset");
			const resetAt = reset
				? new Date(parseInt(reset, 10) * 1000).toISOString()
				: "soon";
			throw new Error(
				`GitHub API rate limit nearly exhausted. Resets at ${resetAt}.`
			);
		}
	}

	async function graphql<T>(
		query: string,
		variables: Record<string, unknown> = {},
		options: { revalidate?: number } = {}
	): Promise<T> {
		const init: RequestInit & { next?: { revalidate: number } } = {
			method: "POST",
			headers: { ...baseHeaders, "Content-Type": "application/json" },
			body: JSON.stringify({ query, variables }),
		};
		if (options.revalidate !== undefined) {
			init.next = { revalidate: options.revalidate };
		} else {
			init.cache = "no-store";
		}

		let lastError: Error = new Error("GitHub GraphQL request failed");
		for (let attempt = 0; attempt <= 2; attempt++) {
			if (attempt > 0) {
				await new Promise((r) => setTimeout(r, 500 * attempt));
			}

			const res = await fetch(GRAPHQL_URL, init);
			checkRateLimit(res.headers);

			if (res.status >= 500) {
				lastError = new Error(`GitHub GraphQL HTTP ${res.status}`);
				continue;
			}
			if (!res.ok) {
				const body = await res.json().catch(() => ({})) as { message?: string };
				throw new Error(body.message ?? `GitHub GraphQL HTTP ${res.status}`);
			}

			const json = await res.json() as { data?: T; errors?: { message: string }[] };
			if (json.errors?.length) {
				throw new Error(json.errors[0].message);
			}
			return json.data as T;
		}
		throw lastError;
	}

	async function restGet<T>(url: string, cacheOptions: { revalidate?: number } = {}): Promise<{ data: T; headers: Headers }> {
		const init: RequestInit & { next?: { revalidate: number } } = {
			headers: baseHeaders,
		};
		if (cacheOptions.revalidate !== undefined) {
			init.next = { revalidate: cacheOptions.revalidate };
		} else {
			init.cache = "no-store";
		}

		let lastError: Error = new Error("GitHub REST request failed");
		for (let attempt = 0; attempt <= 2; attempt++) {
			if (attempt > 0) {
				await new Promise((r) => setTimeout(r, 500 * attempt));
			}

			const res = await fetch(url, init);
			checkRateLimit(res.headers);

			if (res.status >= 500) {
				lastError = new Error(`GitHub REST HTTP ${res.status}`);
				continue;
			}
			if (!res.ok) {
				const body = await res.json().catch(() => ({})) as { message?: string };
				throw new Error(body.message ?? `GitHub REST HTTP ${res.status}`);
			}

			const data = await res.json() as T;
			return { data, headers: res.headers };
		}
		throw lastError;
	}

	return {
		async isOrgMember(org: string): Promise<boolean> {
			// Try the org-membership endpoint first (covers GitHub organisations).
			try {
				await restGet<unknown>(
					`${REST_URL}/user/memberships/orgs/${encodeURIComponent(org)}`,
					{ revalidate: 300 }
				);
				return true;
			} catch { /* not an org, or not a member — fall through */ }

			// Also allow personal-account projects: the "org" equals the user's own login.
			try {
				const { data } = await restGet<{ login: string }>(
					`${REST_URL}/user`,
					{ revalidate: 300 }
				);
				return data.login.toLowerCase() === org.toLowerCase();
			} catch {
				return false;
			}
		},

		async getUserOrgs(): Promise<GitHubOrg[]> {
			const orgs: GitHubOrg[] = [];
			let nextUrl: string | null = `${REST_URL}/user/orgs?per_page=100`;

			while (nextUrl) {
				const { data, headers } = await restGet<{ login: string; avatar_url: string }[]>(
					nextUrl,
					{ revalidate: 300 }
				);
				orgs.push(...data.map((o) => ({ login: o.login, avatarUrl: o.avatar_url })));
				nextUrl = parseNextLink(headers.get("Link"));
			}

			return orgs;
		},

		async getOrgProjects(org: string): Promise<GitHubProject[]> {
			const projects: GitHubProject[] = [];
			let after: string | null = null;

			do {
				const data: OrgProjectsResponse = await graphql<OrgProjectsResponse>(
					LIST_ORG_PROJECTS,
					{ org, after },
					{ revalidate: 120 }
				);

				const pv2 = data.organization?.projectsV2;
				if (!pv2) break;

				projects.push(...pv2.nodes);
				after = pv2.pageInfo.hasNextPage ? pv2.pageInfo.endCursor : null;
			} while (after);

			return projects;
		},

		async getProjectItems(projectId: string): Promise<GitHubIssue[]> {
			const issues: GitHubIssue[] = [];
			let after: string | null = null;

			do {
				const data: ProjectItemsResponse = await graphql<ProjectItemsResponse>(
					LIST_PROJECT_ITEMS,
					{ projectId, after }
				);

				const items = data.node?.items;
				if (!items) break;

				for (const item of items.nodes) {
					const c = item.content;
					// Null content = PullRequest (no fragment) or DraftIssue (no id/number)
					if (!c || !c.id || !c.number) continue;
					if (c.state !== "OPEN" && c.state !== "open") continue;

					issues.push({
						id: c.id,
						projectItemId: item.id,
						number: c.number,
						title: c.title,
						state: (c.state === "OPEN" || c.state === "open") ? "OPEN" : "CLOSED",
						url: c.url ?? "",
						type: "Issue",
						assignees: c.assignees?.nodes ?? [],
						milestone: c.milestone ?? null,
						author: c.author ?? null,
					});
				}

				after = items.pageInfo.hasNextPage ? items.pageInfo.endCursor : null;
			} while (after);

			return issues;
		},

		async getProjectRiceFieldId(projectId: string): Promise<string | null> {
			let after: string | null = null;

			do {
				const data: ProjectFieldsResponse = await graphql<ProjectFieldsResponse>(
					GET_PROJECT_FIELDS,
					{ projectId, after },
					{ revalidate: 3600 }
				);

				const fields: ProjectFieldsResponse["node"]["fields"] | undefined = data.node?.fields;
				if (!fields) return null;

				const found = fields.nodes.find(
					(n: { id?: string; name?: string; dataType?: string }) =>
						n.name === "RICE Score" && n.dataType === "NUMBER"
				);
				if (found?.id) return found.id;

				after = fields.pageInfo.hasNextPage ? fields.pageInfo.endCursor : null;
			} while (after);

			return null;
		},

		async updateProjectItemScore(
			projectId: string,
			itemId: string,
			fieldId: string,
			score: number
		): Promise<void> {
			await graphql(UPDATE_PROJECT_ITEM_SCORE, {
				projectId,
				itemId,
				fieldId,
				value: score,
			});
		},

		async clearProjectItemScore(
			projectId: string,
			itemId: string,
			fieldId: string
		): Promise<void> {
			await graphql(CLEAR_PROJECT_ITEM_SCORE, { projectId, itemId, fieldId });
		},

		/** Sends all updates as a single aliased mutation instead of N individual requests. */
		async batchUpdateProjectItemScores(
			projectId: string,
			itemIds: string[],
			fieldId: string,
			score: number
		): Promise<void> {
			if (itemIds.length === 0) return;

			const mutation = buildBatchUpdateMutation(itemIds);
			const variables: Record<string, unknown> = { projectId, fieldId, value: score };
			itemIds.forEach((id, i) => { variables[`itemId${i}`] = id; });

			await graphql(mutation, variables);
		},
	};
}
