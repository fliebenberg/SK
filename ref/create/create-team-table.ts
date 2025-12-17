export function createTeamTable(schema: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${schema}."team" (
      "id" serial PRIMARY KEY,
      "name" varchar(100) NOT NULL,
      "shortName" varchar(10),
      "orgId" int NOT NULL REFERENCES organisation(id),
      "sportId" int NOT NULL REFERENCES sport(id),
      "pictureUrl" varchar(100),
      "websiteUrl" varchar(100),
      "deleted" boolean DEFAULT false
    );
  `;
}
