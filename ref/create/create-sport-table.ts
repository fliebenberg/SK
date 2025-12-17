export function createSportTable(schema: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${schema}."sport" (
      "id" serial PRIMARY KEY,
      "name" varchar(100) NOT NULL,
      "normalSegments" smallint,
      "normalSegmentTime" smallint,
      "websiteUrl" varchar(100),
      "fieldName" varchar(50),
      "deleted" boolean DEFAULT false
    );
  `;
}
