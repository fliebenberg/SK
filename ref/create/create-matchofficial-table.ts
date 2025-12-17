export function createMatchOfficialTable(schema: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${schema}."matchOfficial" (
      "id" serial PRIMARY KEY,
      "matchId" int NOT NULL REFERENCES match(id),
      "personId" int NOT NULL REFERENCES person(id),
      "officialTypeId" int NOT NULL REFERENCES "officialType"(id),
      "deleted" boolean DEFAULT false
    );
  `;
}
