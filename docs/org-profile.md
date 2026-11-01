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
  phone the name has the whole top row. Tapping the logo opens the picture library and the crop dialog; with a logo set, it first shows the logo with Remove.
- **About** — the description. Optional; shown on the public org page.
- **Address** — see §3.
- **Sports** — read-only chips. Edit opens the sports list; removing a sport with active teams
  shows which teams will be deactivated before it saves (the server deactivates them in the same
  write).

Each card's Edit opens a dialog that saves only that card's fields: **Edit identity** (name, short
code, type, brand colours), **Edit about**, **Edit address**, **Edit sports**. An empty card has no
Edit link — its empty state carries the action ("No address yet. Add address").

**Creating an org**: both ways — the Organisations tab's *Add organisation*
([AddOrgDialog](file:///c:/Fred/Coding/SK/expo-app/components/org/AddOrgDialog.tsx)) and the
*Register an organisation* dialog used where an org is chosen
([RegisterOrgModal](file:///c:/Fred/Coding/SK/expo-app/components/RegisterOrgModal.tsx)) — are
`EditDialog`s (2026-10-31), so they are a bottom sheet on a phone and ask before throwing away what
was typed, and they enter each field as Edit identity does: `FieldLabel`, `TEXT_INPUT`, the short code
in Inter behind a help icon. *Add organisation* also asks for the *Organisation type* (the same
`ORG_TYPES` dropdown, with *Describe it* beside Other — up to `ORG_CUSTOM_TYPE_MAX_LENGTH`, 30
characters, in both dialogs and on the server, which refuses a longer one; the column itself is
`TEXT`) and an optional main sport, chosen from the sports ScoreKeeper has —
it was a free-text box that sent whatever was typed as a sport id. Whoever adds an organisation there becomes
its admin (`creatorId`), and its workspace opens next, since setting it up is what comes next
(2026-10-31); *Register an organisation* makes nobody admin and stays where it was opened.

**Is it already here?** (2026-11-01, `ORG-15`). As a name is typed into either dialog, `get_data`
`possible_duplicate_orgs` asks for organisations it might be a copy of, and they are listed under
the name ([PossibleDuplicateOrgs](file:///c:/Fred/Coding/SK/expo-app/components/org/PossibleDuplicateOrgs.tsx)).
On *Add organisation* each opens its public page, where one with no administrator can be claimed; on
*Register an organisation* each is *Use this*, which chooses it for the game or tournament instead
(one already in the tournament says *Taking part*, and a private one is not offered). The save button
stays disabled until the person ticks *None of these*, because two schools may share a name, so it is
asked and never refused; a different list of matches asks again. The match is
[orgNameMatch](file:///c:/Fred/Coding/SK/server/src/utils/orgNameMatch.ts): accents, case and
punctuation are ignored, words for a kind of organisation (High, College, Club) do not count, and
every remaining word of the shorter name must be in the longer, allowing a typing slip or a trailing
*s* (`Fred Club` and `Fred's Club`). A private
organisation is left out for anyone who cannot see it. If the check itself fails, nothing is listed
and the save is not held up.

The pickers that lead to *Register an organisation* search with `search_similar_orgs`
(`orgSearchScore`, same file), so `Fred Club` finds `Fred's Club` there too: the tournament's *Add
organisations*, a game's two organisation fields, and *New Head to Head*, which has no way to register
one.

**Colours**: both ask for its colours too, through the
same `BrandColorsField` as Edit identity, since whoever sets an org up usually knows them, even as an
outsider. They start as the app's orange and electric blue, which is what a new org keeps if they
are left alone. The primary colour is required; the secondary is optional and marked so, and an admin who
clears it gets the org painted in its primary alone. Each colour falls back to the one before it — `orgColors` in `@sk/shared`.

**Type is required**, and when it is *Other* the description of the type is required too. *Describe
it* appears beside the type only while Other is chosen. The register-an-org dialog is unchanged.

## 3. Address

The org's address uses the app's shared address input
([AddressInput](file:///c:/Fred/Coding/SK/expo-app/components/address/AddressInput.tsx)), which the
site dialogs use too, so that the same kind of data is entered the same way everywhere:

1. **Search** — suggestions from Google's Places API (New) as you type, from three letters and half a
   second after the last keystroke; one search, ended by the pick, is billed as one details lookup
   ([places.ts](file:///c:/Fred/Coding/SK/expo-app/services/places.ts), `VENUE-12`).
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
full map the reader can pan and zoom, the address, **Directions** (handed to the phone's maps app)
and **Copy address** (the clipboard on web, the share sheet on a phone). The organisation's public
page does the same: its Address card's preview opens **`/organizations/[orgId]/map`**
([map.tsx](file:///c:/Fred/Coding/SK/expo-app/app/(tabs)/organizations/%5BorgId%5D/map.tsx)), the
same page with its back link to the organisation. Both are
[OrgAddressMapPage](file:///c:/Fred/Coding/SK/expo-app/components/address/OrgAddressMapPage.tsx), on
the shared [MapPage](file:///c:/Fred/Coding/SK/expo-app/components/address/MapPage.tsx) that a
tournament's map also uses (events.md, `VENUE-10`); a preview is opened by laying
[MapOverlay](file:///c:/Fred/Coding/SK/expo-app/components/address/MapOverlay.tsx) over it, since
the preview map itself takes no gestures.

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
other value has an Edit that opens its dialog. Today: **Visibility** (§5.3), **Minors** (minor age,
and whether minors may have member access) and **Timezone**. New org settings join as further cards.

### 5.3 Private organisations (`ORG-14`, built 2026-10-31)

An org admin can make the organisation **private**; every org is public by default. Decided with the
user on 2026-10-31, kept as simple as possible:

*   **Who sees it: current members only**, and app admins. Not guardians, Trusted Contacts or people the
    org only has a profile for. To everyone else it does not exist: it is left out of the directory,
    the org searches, Home and the map, and its page reads *could not be found* rather than locked.
*   **Former members keep the games they played in** (they are on a team sheet), with the event's name
    and the venue the game needs, but not the org: the game page names the organisations and the
    tournament as plain text instead of links, and Back goes Home (`useCanOpenOrg`; each side in a game
    summary carries `orgIsPrivate`).
*   **Members see it marked *Private*** — in the directory, on its page header and on Home — so they
    know why nobody else can see it.
*   **It plays only among itself.** No game, tournament, Head to Head or league season of it may involve
    another organisation. The server refuses any write that would mix them; the pickers do not offer it.
*   **No going private with a history.** An org that has ever shared a game, tournament or season with
    another organisation (a declined invitation does not count) can never be made private, and the card
    is not shown at all. Nor is it on an unclaimed org, which has no admin to decide. In practice it
    appears on new organisations and on private ones.
*   **Joining is by the existing invite**: an admin adds the person and sends the invite.
*   **Either change asks first.** Going private says who will no longer see it and that it cannot play
    other organisations; going public says everything becomes visible — members' names on team sheets
    included, until people can choose (`PEOPLE-4`) — and that it cannot go back once it has played
    another organisation.

The rules live in [privateOrgs.ts](file:///c:/Fred/Coding/SK/server/src/managers/privateOrgs.ts):
`ORG_VISIBLE` for every list and search, a `subject` on each public room in
[roomAccess.ts](file:///c:/Fred/Coding/SK/server/src/wss/roomAccess.ts) so a private owner closes it,
and one invariant checked inside each write's transaction — *an event or season with a private org in
it has no other org* — rather than a check per screen. Going private also pushes non-members out of
rooms they already hold. Card: [OrgPrivacyCard.tsx](file:///c:/Fred/Coding/SK/expo-app/components/org/OrgPrivacyCard.tsx).

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
keep their own action, `SET_ORG_MINORS_SETTINGS`, and so does privacy, `SET_ORG_PRIVATE`. `UPDATE_ORG` with `address: null` removes the
address.

## 8. Who may see and edit them

Settled 2026-10-31 (`ORG-13`, [permissions.md](file:///c:/Fred/Coding/SK/docs/permissions.md) §4.2):
**only the organisation's admins change Profile and Settings** — every card, the logo, the timezone,
privacy and minors. Staff open both and read them exactly as an admin sees them, but with no Edit
links, no empty-state actions and no switches, and nothing saying why (permissions.md P2, P3). Members
have no workspace, so they reach neither; a coach's workspace does not list them. The server's gates
already matched: `UPDATE_ORG`, `SET_ORG_PRIVATE` and `SET_ORG_MINORS_SETTINGS` are admin only.
