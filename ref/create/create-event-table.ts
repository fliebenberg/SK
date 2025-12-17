export function createEventTable(schema: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${schema}.event (
      "id" serial PRIMARY KEY,
      "name" varchar(100) NOT NULL,
      "orgId" int NOT NULL REFERENCES "organisation"(id),
      "venueId" int REFERENCES "venue"(id),
      "websiteUrl" varchar(100),
      "startTime" timestamptz,
      "endTime" timestamptz,
      "deleted" boolean DEFAULT false
    );
  `;
}
