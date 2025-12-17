export function createMatchStatsTable(schema: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${schema}."matchStats" (
      "id" serial PRIMARY KEY,
      "matchId" int NOT NULL REFERENCES match(id),
      "matchStats" jsonb
    );
  `;
}
