# Server data

## `places-za.json.gz`

South Africa's towns, villages and suburbs, for Home's place names and place search (`HOME-4`,
[docs/home.md](../../docs/home.md) §3). Generated — do not edit by hand. Rebuild with
`npm run places:build` in `server/` and commit the result.

Sources, both of which ask to be credited where the names are shown (Home's location dialog does):

- © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, under the
  [Open Database Licence](https://opendatacommons.org/licenses/odbl/).
- [GeoNames](https://www.geonames.org/), under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Never add to it from Google Maps results: Google's terms forbid building a mapping dataset from
its content.
