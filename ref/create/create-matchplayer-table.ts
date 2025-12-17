export function createMatchPlayerTable(schema: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${schema}."matchPlayer" (
      "id" serial PRIMARY KEY,
      "matchId" int NOT NULL REFERENCES match(id),
      "personId" int REFERENCES person(id),
      "teamId" int REFERENCES team(id),
      "positionId" int REFERENCES position(id),
      "deleted" boolean DEFAULT false
    );
  `;
}
