export function createFieldTable(schema: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${schema}.field (
      "id" serial PRIMARY KEY,
      "name" varchar(100) NOT NULL,
      "addressId" int REFERENCES "address"(id),
      "venueId" int REFERENCES "venue"(id),
      "deleted" boolean DEFAULT false
    );
  `;
}
