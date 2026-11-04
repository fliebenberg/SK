# People list and person page

On 2026-10-03 the org admin's People screens were redesigned to the read-first rules in
[okf/design_system.md](file:///c:/Fred/Coding/SK/okf/design_system.md) (*Read-first record pages*),
the same way the org Profile and Settings were ([org-profile.md](file:///c:/Fred/Coding/SK/docs/org-profile.md)).
This document records what each screen shows and why.

## 1. What changed

There were three screens: the list, a read-only **view** screen, and a separate **edit** form with
a floating save bar. Admin and Staff were sent to the form, everyone else to the view, and the list
had an eye button to reach the view. The view and the form are now **one page**,
`/admin/[orgId]/people/[membershipId]`; a viewer who cannot edit sees it without Edit links, Invite
or the ⋯ menu. The old `/view` route is gone.

## 2. The list — `/admin/[orgId]/people`

[people.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/people.tsx). A row is the
person at a glance, and opens their page.

- **Role badge after the name, for Staff and Admin only.** Member is what most people are, so it
  gets no badge. The same [`RoleBadge`](file:///c:/Fred/Coding/SK/expo-app/components/people/PersonBits.tsx)
  is on the person page.
- **The org ID with no label** ("Student #" would be wrong for a staff number) — under the name on a
  wide screen, right-aligned on the name's line on a phone.
- **Wide**: email and cell stacked in their own column, then a Guardian column (the primary guardian,
  "+1" when there are two).
- **Phone, two lines**: name, badges and org ID; then email on the left and cell on the right. A
  Minor or Dependant tag (§4) stands in for the guardian column.
- **No account status and no Invite.** Who is on ScoreKeeper is a question about one person, so it
  is answered on their page, which is also the only place to invite from.
- **Filter by role** with counts (All / Admin / Staff / Member / Guardians), search by name, email or
  org ID, and sort by name or role.
- **The list is members; guardians are found two ways** (`PEOPLE-9`). They hold no membership, so they
  are not in All until someone searches: a search under All also finds guardians with no membership,
  so nobody has to know which list to look in. The **Guardians** filter lists everyone who is a guardian,
  members among them, with who they answer for, and also finds them by cellphone or by a child's name.
  Trusted contacts (`MEMBER-5`) get a filter the same way when they are built.
- **Add person** is a labelled button for Admin and Staff only (the "+" used to be shown to everyone
  and refused on save, `UI-22`). It opens
  [AddPersonDialog](file:///c:/Fred/Coding/SK/expo-app/components/people/AddPersonDialog.tsx): name
  (which searches people already on record), role, email, cell, birthdate, org ID and an optional
  guardian behind an "Add a guardian" link. A photo and national ID are added from the person's page.
- **Adding never changes someone already on record** (`PEOPLE-7`). An org ID someone else holds is
  refused, here and on the person's page. Admin and Staff are told who holds it, so they can search for
  them by name; a coach or event organiser only that it is in use. Picking someone already a member is
  refused too, and leaves their role and details as they are: a role changes on their page.
- Import from a spreadsheet stays in the header's ⋯ menu.

## 3. The person page — `/admin/[orgId]/people/[membershipId]`

[\[membershipId\].tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/people/%5BmembershipId%5D.tsx).

- **Banner** ([PersonBanner](file:///c:/Fred/Coding/SK/expo-app/components/people/PersonBanner.tsx))
  mirrors the list row, larger: photo (tap to edit), name, role badge, Minor/Dependant tag; under the
  name the org ID and, once they have an account, "✓ On ScoreKeeper". Its Edit opens **Edit
  identity** — name, role (a segmented control: there are only three) and org ID.
- **Contact** (email, cell) and **Personal details** (birthdate with age, national ID), each with
  its own dialog ([PersonDialogs](file:///c:/Fred/Coding/SK/expo-app/components/people/PersonDialogs.tsx)).
  National ID could not be edited at all before; the old form held it but had no field for it.
- **Cards that would be empty for most people are left out**, rather than shown empty:
  - **ScoreKeeper account** shows only while they are not on the app — Invite, or Resend while an
    invite is pending. Once they are on it, the banner says so.
  - **Guardians** shows only for a minor or someone who has a guardian. For anyone else, Add guardian
    is in the ⋯ menu. Each guardian's actions (invite, make primary, edit, remove) are in one ⋯ menu
    on their row.
  - **Member access** shows only for a minor or dependant, as before.
- **⋯ menu**: Edit photo, Add guardian (when there is none), and Remove from organisation, set apart
  and confirmed. Removing used to be a red Danger Zone box on the page.
- **Layout**: up to the app's page width (1440px, `<PageBody>`). Wide, Contact and Personal details on the left, the other cards on the
  right — or Contact and Personal side by side when there are no others. On a phone one column,
  guardians and member access first.

## 3a. The guardian page — `/admin/[orgId]/people/guardian/[profileId]`

[\[profileId\].tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/people/guardian/%5BprofileId%5D.tsx),
for a guardian with no membership, as the person page is keyed by membership. The same read-first cards
without a role or member access, plus **Answers for**: each child, the relationship, and a link to the
child's page. A guardian who is also a member opens their ordinary person page instead (`PEOPLE-16`).
**Remove from organisation** in the ⋯ menu ends every link they have, once confirmed (§9).

## 4. Minor and Dependant

The app treats anyone with a guardian as a minor, whatever their age (`isMinorIn` in
[guardians.ts](file:///c:/Fred/Coding/SK/shared/src/utils/guardians.ts)). Calling a 26-year-old with
a guardian a "minor" is wrong, so the screens use two words for the one rule:

- **Minor** — younger than the org's minor age (Settings › Minors).
- **Dependant** — at or over it, with a guardian. The word the guardian's side already uses (My
  Family, `dependants`, `SEND_DEPENDANT_INVITE`). "Delegate" was ruled out because delegation in
  this app means handing over organisational duties
  ([identity_structure.md](file:///c:/Fred/Coding/SK/docs/identity_structure.md) §5.5).

Only the label differs; the rules are the same for both (`guardianshipOf` in
[PersonBits.tsx](file:///c:/Fred/Coding/SK/expo-app/components/people/PersonBits.tsx)).

## 5. Data and live updates

Since `LIST-1` (2026-11-01) People is a static list, paged and filtered on the server ([usePagedList](file:///c:/Fred/Coding/SK/expo-app/hooks/usePagedList.ts), `org_people`), and a person's page reads that one person ([useOrgPerson](file:///c:/Fred/Coding/SK/expo-app/hooks/useOrgPerson.ts), `org_person`). Each reads again when the page comes back into view and after any change made from this device, so a save shows at once for whoever made it; someone else's shows at the next read. The add-to-team dialogs and the tournament person picker search on the server too. What follows describes the rooms these replaced:

Both screens read members through useOrgMembers
(`org:{id}:members`) and guardians through `useOrgGuardians`, so a save shows everywhere without a
refetch. Each dialog sends only the fields that changed; an emptied field goes as `null`, which
clears it. `UPDATE_ORG_PROFILE` now publishes the **member row** rather than the bare profile, as
`UPDATE_ORG_MEMBER` already did: the screens read the org ID as `personOrgId`, and `hasAccount` and
`restrictedReason` follow from the email and birthdate just saved. The old edit form hid the stale
values behind its own copy of the fields.

## 7. Asking to join (`MEMBER-1`)

An organisation is **invite only** by default: its admins and staff add people. Its admin can switch it
to **anyone can apply** in Settings; private and unclaimed organisations do not take applications.

- **On its public page**, one that takes applications offers *Apply to join*, to the side of the banner
  on a wide screen and on a line below it on a phone. Signed out, the button asks them to sign in. It
  stays after applying, as they may be applying for themselves and for each child. One that does not is
  flagged *Invite only*, for those who do not belong, with the reason on hover or tap.
- **The form** asks for yourself: name, date of birth and cellphone; for your child: their name and date
  of birth, then your name, cellphone and what you are to them. Your email comes from your account, and a
  note is optional. The date of birth is required because the minor rules read it: a person with none
  counts as an adult. Someone under the organisation's minor age cannot apply for themselves unless it
  gives minors their own access. It says once that ages and contact details are not public.
- **Applying joins nobody.** It writes an application and no profile or membership, and emails the
  organisation's admins and staff. The applicant sees it on the page, and can withdraw it.
- **Admins and staff decide**, from a list at the top of People, there only while something is waiting,
  and counted on the People & Roles card. If someone with a similar name is on record, whoever decides
  says whether that is them before Approve is available. For a child they are asked about the parent
  applying as well (`MEMBER-7`), unless the parent's own record is already known.
- **The same number is a match to ask about**, marked *Same cellphone*, even with a different name. It
  is never linked by itself, because nothing verifies the number an applicant types. The applicant is
  never told a number is on record. A number on a child's application is the parent's, so it says
  nothing about the child.
- **Approving** always gives the plain Member role. For a child it also records the applicant as primary
  guardian, who holds no membership. A record the decider picked keeps what it says, and only fills what
  it lacks. *Someone new* keeps the number they gave, even when another record has it. Declining tells
  them by email, and the same person can be applied for again after 30 days.

## 8. One email to a person; a number can be shared

Decided 2026-11-03 (`MEMBER-7`), everywhere a person is written.

- **An email belongs to one person in an organisation.** Access follows the address, so two people
  sharing one would be one login holding both people's memberships and roles. The add and edit forms,
  linking an address and sending an invite all refuse it, saying whose it is to Admin and Staff, and to
  anyone else only that it is in use. It is compared ignoring case and spaces. The same person can use
  it at another organisation. The database holds to this too (`idx_org_profiles_one_email`), so two
  saves at once cannot both get through.
- **A cellphone number is contact information, not identity.** People share a phone, and numbers change
  hands, so a number is never refused, and never links or admits anyone. The add, edit and guardian
  forms say *Also on record for …* while it is being typed, with who to Admin and Staff, and to a coach
  only that someone does. The import warns on the row, as it did already
  ([identity_structure.md](file:///c:/Fred/Coding/SK/docs/identity_structure.md) §8.2).

## 9. Leaving and coming back

Decided 2026-11-04. **This is about the org profile, a person's record in one organisation. Their user
account, which is their login and settings, and their org profiles elsewhere, are never touched.** A
person deleting their own account is a separate, larger piece of work (`PEOPLE-15`).

- **Someone with no part left in an organisation has their org profile made inactive.** That happens
  when they are removed as a member, when a guardian's last link ends, and when a guardian is removed
  from the organisation. A part is a membership, a guardian link, a team role, an appointment to a
  tournament that is not over, an entry in one, or a game still to officiate. Past games are history,
  not a part. A parent removed as staff stays on as a guardian.
- **Removing a member ends their team roles and their guardians' links to them.** Nobody answers for
  someone who has left, so a guardian whose last child leaves goes too. If the child returns, their
  guardians are linked again by hand.
- **A guardian cannot be removed while they have another part here**, and the refusal says which.
- **An inactive org profile is kept, details and all,** so match histories and the record stand. It
  holds nothing: its email and org ID are free for an active profile in that organisation, it gives no
  access, and only the add forms offer it. How long the details stay is for the cleanup to decide
  (`PEOPLE-14`). No screen shows them meanwhile, apart from "is this them?" to Admin and Staff.
- **A returning person gets the same org profile back, if whoever adds them says it is the same
  person.** A name, email or org ID matching someone who left is offered on Add person and on the
  guardian forms, as a question: the address may have changed hands, so ignoring it adds someone new. An
  application names them as a possible match. An import matches by email, org ID or national ID, never
  by name, and its preview says the row brings them back. Whatever someone else now holds, they come
  back without.
- **A new org profile with the email of someone who left** is linked to the same user account as the old
  one, as an email always is. The account sees current memberships only, and no screen lists history by
  account today; a later one can read both, as the inactive profile keeps its link to the account.
