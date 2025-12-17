export function createAddressTable(schema: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${schema}.address (
      "id" serial PRIMARY KEY,
      "addresstext" varchar(200) NOT NULL,
      "googlePlaceId" varchar(100),
      "lat" varchar(20),
      "lng" varchar(20),
      "lastUpdate" timestamptz,
      "deleted" boolean DEFAULT false
    );
  `;
}
