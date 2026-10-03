# Organisation Profile, Settings and Nominate admin

The organisation's basic info used to be one long form, `admin/[orgId]/settings.tsx`: every value an
open input, all of it saved by one floating save bar. On 2026-10-01 it was redesigned and split into
three pages. This document records what each page is for and why it is built the way it is. The
general rules this work produced are in [okf/design_system.md](file:///c:/Fred/Coding/SK/okf/design_system.md)
under *Read-first record pages*.

## 1. Why it changed

The page is **read many times and edited rarely**: someone opens it to see what the org looks like
and whether it is set up right, and occasionally changes one thing. The old form read like a paper
form — open inputs everywhere, a one-off choice (organisation type) shown as seven chips forever,
Orbitron in typed fields, the identity split over three rows, inputs stretched across the whole
screen, and three different ways of saving on one page.

It also hid a bug: the description field never saved. There was no `description` column, and
`UPDATE_ORG` dropped the field without a word. `20261001_org_description.ts` added the column.

## 2. Profile — `/admin/[orgId]/profile`

Who the org is, and how everyone else sees it. [profile.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/profile.tsx)

- **Banner** ([OrgProfileBanner](file:///c:/Fred/Coding/SK/expo-app/components/org/OrgProfileBanner.tsx)),
  in the org's colours. Logo; the name with the short code directly under it in the same font (it
  is the name's short form, not a badge); a footer row with the type and the location (city and
  province, city only on a phone), each with its own icon; and Edit at the end of that row, so on a
  phone the name has the whole top row. Tapping the logo opens the logo editor.
- **About** — the description. Optional; shown on the public org page.
- **Address** — see §3.
- **Sports** — read-only chips. Edit opens the sports list; removing a sport with active teams
  shows which teams will be deactivated before it saves (the server deactivates them in the same
  write).

Each card's Edit opens a dialog that saves only that card's fields: **Edit identity** (name, short
code, type, brand colours), **Edit about**, **Edit address**, **Edit sports**. An empty card has no
Edit link — its empty state carries the action ("No address yet. Add address").

**Colours**: both ways of creating an org — the Organisations tab's *Add Organization* and the
*Register an organisation* dialog used where an org is chosen — ask for its colours too, through the
same `BrandColorsField` as Edit identity, since whoever sets an org up usually knows them, even as an
outsider. They start as the app's orange and electric blue, which is what a new org keeps if they
are left alone. The primary colour is required; the secondary is optional and marked so, and an admin who
clears it gets the org painted in its primary alone. Each colour falls back to the one before it — `orgColors` in `@sk/shared`.

**Type is required**, and when it is *Other* the description of the type is required too. *Describe
it* appears beside the type only while Other is chosen. The register-an-org dialog is unchanged.

## 3. Address

The org's address uses the app's shared address input
([AddressInput](file:///c:/Fred/Coding/SK/expo-app/components/address/AddressInput.tsx)), which the
site editor uses too, so that the same kind of data is entered the same way everywhere:

1. **Search** — suggestions from Google Places as you type.
2. **Picked** — the address as text, with *Change* and *Edit details*, and a map whose pin can be
   dragged onto the main entrance.
3. **Enter it yourself** — unit or building (optional), street, suburb (optional), town, postal code
   (optional), province (optional) and country, for an address Google does not know, or to add a
   unit or building to a picked one.

The unit or building is filled from Google only when its result has a unit or premise part, which is
rare. It is never filled with the place's name: a search for a school by name finds the school, but
the name belongs on the organisation or site, not in its address.

The full address is public: it is optional and can be typed by hand, so the org decides how much to
give. On the Profile, the map preview (desktop) or thumbnail (phone) opens **`/admin/[orgId]/address`**
([address.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/address.tsx)): the pin on a
full map, the address, **Directions** (handed to the phone's maps app) and **Copy address** (the
clipboard on web, the share sheet on a phone).

## 4. Timezone and the address pin

The server derives `addressTimeZone` from the address pin on every read (`timeZoneAt`, the same
offline lookup sites use); it is never stored. The org's own `timezone` is a separate setting and
**may differ on purpose**. The app only says so when a change makes them differ:

- **Saving an address** whose pin is in another timezone: the address saves, then *Change the
  organisation timezone?* offers the address's timezone or keeping the current one.
- **Choosing a timezone by hand** that differs from the pin's: a note inside the dialog — *The
  organisation address is in a different timezone, … The value you select here will be used in the
  app.* Nothing is blocked.
- **While they differ**, the Timezone card on Settings keeps a quiet line saying so, for the next
  admin who reads it.
- **No pin** (no address, or one typed in): nothing to compare, so nothing is said.

## 5. Settings — `/admin/[orgId]/settings`

How the org runs. [settings.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/settings.tsx)
One card per setting or group of related settings, **each saving itself**: a switch saves when it is
flipped (after a confirmation where the change is far-reaching, as for minors' member access); any
other value has an Edit that opens its dialog. Today: **Timezone** and **Minors** (minor age, and
whether minors may have member access). New org settings join as further cards.

## 6. Nominate admin — `/admin/[orgId]/nominate`

Only while the org has no administrator. The workspace banner shows on every admin page, and the
workspace menu gets an amber **Nominate admin** item above the rest, set apart by a divider. The page
([nominate.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/nominate.tsx)) explains what
nominating does and lists every nomination with its status and Resend. Once the org has an
administrator, the banner, the menu item and the list all go; the nominations stay in the database
but are not shown. The process itself: [nomination-process.md](file:///c:/Fred/Coding/SK/docs/nomination-process.md).

## 7. Data and live updates

All three pages read the org through `useOrgSummary(orgId)`, which only joins the
`org:{id}:summary` room: its join push is the initial load, and every save republishes the whole
org, so nothing refetches after a save. The workspace layout, left rail and Control Panel read the
org the same way (`LIVE-12`), so an edit here shows everywhere at once.
Every edit is an `UPDATE_ORG` patch carrying only the fields its dialog owns; the minors settings
keep their own action, `SET_ORG_MINORS_SETTINGS`. `UPDATE_ORG` with `address: null` removes the
address.

## 8. Not settled here

Who may see and edit Profile and Settings is a separate permissions exercise (`ORG-13`). Until then
the pages behave as the old screen did: anyone who reaches the workspace can edit the profile, and
only an org admin can change the minors settings.
