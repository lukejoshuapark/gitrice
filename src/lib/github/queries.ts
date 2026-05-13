export const LIST_ORG_PROJECTS = `
	query ListOrgProjects($org: String!, $after: String) {
		organization(login: $org) {
			projectsV2(first: 50, after: $after) {
				pageInfo {
					hasNextPage
					endCursor
				}
				nodes {
					id
					number
					title
					closed
				}
			}
		}
	}
`;

export const GET_PROJECT_FIELDS = `
	query GetProjectFields($projectId: ID!, $after: String) {
		node(id: $projectId) {
			... on ProjectV2 {
				fields(first: 100, after: $after) {
					pageInfo {
						hasNextPage
						endCursor
					}
					nodes {
						... on ProjectV2Field {
							id
							name
							dataType
						}
						... on ProjectV2SingleSelectField {
							id
							name
							dataType
						}
						... on ProjectV2IterationField {
							id
							name
							dataType
						}
					}
				}
			}
		}
	}
`;

export const UPDATE_PROJECT_ITEM_SCORE = `
	mutation UpdateProjectItemScore($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: Float!) {
		updateProjectV2ItemFieldValue(input: {
			projectId: $projectId
			itemId: $itemId
			fieldId: $fieldId
			value: { number: $value }
		}) {
			projectV2Item {
				id
			}
		}
	}
`;

// Issues only — PullRequests are excluded so the client never receives or filters them.
// DraftIssues lack id/number and are dropped server-side.
export const LIST_PROJECT_ITEMS = `
	query ListProjectItems($projectId: ID!, $after: String) {
		node(id: $projectId) {
			... on ProjectV2 {
				items(first: 100, after: $after) {
					pageInfo {
						hasNextPage
						endCursor
					}
					nodes {
						id
						content {
							... on Issue {
								id
								number
								title
								state
								url
								author { login avatarUrl }
								milestone { title number }
								assignees(first: 10) {
									nodes {
										login
										avatarUrl
									}
								}
							}
						}
					}
				}
			}
		}
	}
`;

/**
 * Builds a single GraphQL mutation that updates all items in one request using
 * field aliases, replacing the previous N+1 pattern. Item IDs are GitHub-
 * supplied opaque node IDs (base64), never user input.
 */
export function buildBatchUpdateMutation(itemIds: string[]): string {
	const paramList = itemIds.map((_, i) => `$itemId${i}: ID!`).join(", ");
	const aliases = itemIds
		.map(
			(_, i) => `
		item${i}: updateProjectV2ItemFieldValue(input: {
			projectId: $projectId
			itemId: $itemId${i}
			fieldId: $fieldId
			value: { number: $value }
		}) { projectV2Item { id } }`
		)
		.join("\n");

	return `
		mutation BatchUpdateProjectItemScores(
			$projectId: ID!, $fieldId: ID!, $value: Float!, ${paramList}
		) {
			${aliases}
		}
	`;
}
