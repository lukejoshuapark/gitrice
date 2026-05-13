import { TableClient, TableEntity } from "@azure/data-tables";
import type { RiceScore } from "@/types";
import type { ScoreStore } from "./types";

interface ScoreEntity extends TableEntity {
	reach?: number;
	impact?: number;
	confidence?: number;
	effort?: number;
}

function partitionKey(org: string, projectId: string): string {
	// Strip any character that isn't valid in Azure Table Storage keys or that
	// could be injected into OData filter strings. GitHub org names are already
	// [a-zA-Z0-9-], but we sanitize here as a defence-in-depth measure.
	return `${org.replace(/[^a-zA-Z0-9-]/g, "_")}__${projectId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function getClient(): TableClient {
	const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
	if (!connectionString) {
		throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
	}
	return TableClient.fromConnectionString(connectionString, "ricescores", {
		allowInsecureConnection: connectionString.includes("UseDevelopmentStorage"),
	});
}

async function ensureTable(client: TableClient): Promise<void> {
	try {
		await client.createTable();
	} catch (err: unknown) {
		// TableAlreadyExists is expected
		if ((err as { statusCode?: number }).statusCode !== 409) {
			throw err;
		}
	}
}

function entityToScore(entity: ScoreEntity): RiceScore {
	return {
		reach: entity.reach ?? null,
		impact: entity.impact ?? null,
		confidence: entity.confidence ?? null,
		effort: entity.effort ?? null,
	};
}

export const azureStore: ScoreStore = {
	async getScores(org, projectId) {
		const client = getClient();
		await ensureTable(client);
		const pk = partitionKey(org, projectId);
		const result: Record<string, RiceScore> = {};

		const entities = client.listEntities<ScoreEntity>({
			queryOptions: { filter: `PartitionKey eq '${pk}'` },
		});

		for await (const entity of entities) {
			result[entity.rowKey] = entityToScore(entity);
		}

		return result;
	},

	async getScore(org, projectId, issueId) {
		const client = getClient();
		await ensureTable(client);
		const pk = partitionKey(org, projectId);
		try {
			const entity = await client.getEntity<ScoreEntity>(pk, issueId);
			return entityToScore(entity);
		} catch {
			return null;
		}
	},

	async setScore(org, projectId, issueId, score) {
		const client = getClient();
		await ensureTable(client);
		const pk = partitionKey(org, projectId);

		// Fetch existing to merge
		let existing: RiceScore = { reach: null, impact: null, confidence: null, effort: null };
		try {
			const entity = await client.getEntity<ScoreEntity>(pk, issueId);
			existing = entityToScore(entity);
		} catch {
			// Entity does not exist yet, that's fine
		}

		const merged: RiceScore = { ...existing, ...score };

		const entity: ScoreEntity = {
			partitionKey: pk,
			rowKey: issueId,
		};

		if (merged.reach !== null) entity.reach = merged.reach;
		if (merged.impact !== null) entity.impact = merged.impact;
		if (merged.confidence !== null) entity.confidence = merged.confidence;
		if (merged.effort !== null) entity.effort = merged.effort;

		await client.upsertEntity(entity, "Replace");
		return merged;
	},
};
