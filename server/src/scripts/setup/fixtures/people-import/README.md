# People import sample — Test Hoërskool Doringkloof

[doringkloof-people-import.xlsx](doringkloof-people-import.xlsx) is a spreadsheet for trying the
people import (`/admin/fx-org-dkl/people/import`, or `IMPORT_ORG_PEOPLE`) against the test
organisation Doringkloof. It has valid rows of every kind and one row for each way a row can be
refused, so a single preview shows everything the screen can say.

It is written against the test organisations **as loaded** — run `npm run db:test-orgs` first. After
you **import** it, the people it adds are on record, so a second preview reads differently (most
rows become "no change"). `db:test-orgs` puts Doringkloof back, including removing what the import
added.

Built by [expo-app/scripts/make-people-import-sample.js](../../../../../../expo-app/scripts/make-people-import-sample.js)
(`node scripts/make-people-import-sample.js` from `expo-app/`). Change a row there and here together.

## Expected preview

**7 new, 3 to update, 2 no change, 15 with problems; 5 guardian links to add, 4 of them new
guardians.** Sheet warning: *The column "House" is not one we read, so it was ignored.*

Rows 2–14 are valid. Row 12 is blank on purpose, so the numbering shows it was skipped. Cellphone
numbers are stored in international form (`+27825550100`) however they were typed.

| Row | Person | Expect | What it tests |
|---|---|---|---|
| 2 | Thandi Nkosi | New | A new player with a new guardian (Nomsa Nkosi). Birthdate is a real date cell; cellphone typed with `+27`. |
| 3 | Sipho Nkosi | New, warning | Thandi's brother: Nomsa again (email in different case) is **one** guardian profile, linked to both. Guardian 2 (Grace Nkosi, Grandparent) has only a cellphone. His national ID fails the South African ID check: a warning, not a problem. |
| 4 | Karin de Wet | New | New Staff member. Cellphone typed with `0027`; a valid South African ID number. |
| 5 | Lindiwe Dube | New, warning | A minor with an email: *counts as a minor here…* (Doringkloof's minors setting is off). Her cellphone is a **number cell** that lost its leading 0, and is read as +27825550104. |
| 6 | Ruan Potgieter | Update | Matched by Member ID DKL0005; Cellphone none → +27715550130. The empty cells leave the rest alone. |
| 7 | Hennie Steyn | Update | Matched by email, no Member ID; Role Member → Staff. |
| 8 | Anika Kotzé | Update | Matched by Member ID DKL0043; only change is a new guardian, Karin Kotzé. |
| 9 | Francois Marais | No change | Matched by email; nothing differs. |
| 10 | Johan van der Merwe | No change, warning | The Admin, asked to be Staff: *an import does not change an Admin's role.* |
| 11 | Mia Strydom | New, warning | A name alone never matches: added as someone new, flagged as a possible duplicate of DKL0044. |
| 13 | James Thornton | New, warning | His email already has a ScoreKeeper account (St Aldric's): *gets access as Member straight away.* **Importing this row gives that account access to Doringkloof.** |
| 14 | Oliver Grant | New | A foreign cellphone (+44) and a passport number: neither is checked against South African rules. |
| 15 | *(no name)* | Problem | Full name is empty. |
| 16 | Pieter Kruger | Problem | Invalid email. |
| 17 | Sarah Botes | Problem | Birthdate typed as text `12/05/2011` — ambiguous, so refused. |
| 18 | Willem Joubert | Problem | Role Admin: an import never makes an Admin. |
| 19 | Riaan Venter | Problem | Role "Coach" is not an organisation role. |
| 20 | Lerato Sithole | Problem | Guardian with a name but no email or cellphone. |
| 21 | Zoe Pillay | Problem | Guardian shares the player's email. |
| 22 | Ethan Naidoo | Problem | Guardian relationship "Uncle" is not one we know. |
| 23, 24 | Jan Botha, Johan Botha | Problem (both) | The same Member ID, DKL0914, on two rows. |
| 25 | Annelie Botha | Problem | Her email is on record with Member ID DKL0002, not DKL0915. |
| 26 | Aiden Smith | Problem | Guardian 1 and Guardian 2 have the same email. |
| 27 | Nico Venter | Problem | Cellphone `082 555` has too few digits to be read. |
| 28, 29 | Emma Jacobs, Mila Jacobs | Problem (both) | The same national ID on two rows, typed once with spaces. |

Importing takes the 10 new and updated rows; the no-change and problem rows are left out.

**Not shown by this file**, because the test organisations hold no national IDs or cellphone
numbers until it is imported: a row **matched by national ID**, and the warning for a **cellphone
already on record** for someone else. After importing it once, a row with only a name and Karin de
Wet's national ID `8001015009087` is matched to her, and a new row with Ruan Potgieter's cellphone
`071 555 0130` gets the warning. Both are also checked by
[test-people-import.ts](../../../test-people-import.ts).
