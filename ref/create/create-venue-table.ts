export function createVenueTable(schema: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${schema}."venue" (
      "id" serial PRIMARY KEY,
      "name" varchar(100) NOT NULL,
      "addressId" int REFERENCES address(id),
      "orgId" int REFERENCES organisation(id),
      "deleted" boolean DEFAULT false
    );
  `;
}
