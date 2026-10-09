# Communication — Feature Design

**Status:** Draft for discussion, started 2026-10-04. Review round 1 settled the shape: **channels
attached to subjects**, private conversations only between a channel's members and its admins, and
the principles in §1. Round 2 settled channel admins, surveys and WhatsApp. Round 3 (2026-10-05)
closed the remaining open questions. All three rounds are recorded in §15 as C1–C35, and **the design
is now complete enough to mock up**. The aim of this pass is to describe the **whole** solution. Once that is agreed, it gets
cut into parts that can be built one at a time.
**Replaces, once agreed:** the communication entries in
[FUTURE_IDEAS.md](file:///c:/Fred/Coding/SK/FUTURE_IDEAS.md) ("In-app communication",
"Communication — pain points and candidate features"). The "Polls" entry there is absorbed by
surveys (§7).
**Related:** Organisation calendar and Team event in the same file;
[identity_structure.md](file:///c:/Fred/Coding/SK/docs/identity_structure.md) §5 (guardians, who
answers for a player, Trusted Contacts); `MEMBER-5`, `MEMBER-6` and the `REP-*` group in
[TODO.md](file:///c:/Fred/Coding/SK/TODO.md); the shareable-results and hide-results tasks in the
same file.

---

## Purpose

Get the right information to the right adult about a child's or a team's sport, in a way they will
actually notice. Then let them answer, and let the person who asked see who has and has not.

ScoreKeeper already holds most of what clubs and schools communicate about: fixtures, venues,
squads, results, and who each player's guardians are. Today that information leaves the app as text
someone retypes into WhatsApp, a newsletter, a PDF or a letter in a schoolbag. Then it is out of
date the moment anything changes.

## What the research says

Three interviews, and all three put communication ahead of scoring.

- **A club runs on WhatsApp** (Tableview FC, 2026-09-09). Committee, coaches, parents and supporters
  all talk there. The minis use a WhatsApp **Community**: every age-group chat sits under one
  umbrella, with a broadcast channel. The admin wants to extend that to every age group. He wants
  **push, not a board**: *"put it on a board and hope somebody sees it"* is the thing he is escaping.
- **A parent has seven channels and reads none of them properly** (Wynberg Boys' Primary,
  2026-09-11):
  - Newsletter by email *and* D6
  - A read-only sheet
  - Class WhatsApp groups run by a parent class rep
  - One teacher's Google Classroom
  - PDF flyers
  - Festival document packs
  - A paper letter

  The school's communicator app, **D6, is opened only as a pop-up notification.** A missed message
  cost her a match: she didn't know her son was selected, and in the end the match had been
  cancelled. **Nothing confirms a parent has seen anything.** She preferred Google Classroom to
  WhatsApp *"because WhatsApp can get quite crowded with personal stuff"*.
- **A school sports office over-informs and still loses money** (Van Riebeeckstrand Primary,
  2026-09-14). In the coordinator's view primary schools send parents *too much*. Even so:
  - Transport is counted with a hand-built WhatsApp poll for every team, every week.
  - Buses cost R30,000–R40,000 a trip and leave half-empty when parents change their minds on the
    morning.
  - Some schools never answer email and some have no sports coordinator at all.
  - A date agreed between two schools was disputed months later, with no record of what was agreed.

Detail and the candidate features are in the FUTURE_IDEAS entries named above.

## 1. Principles

Agreed in round 1, with the amendments made there.

| # | Principle | Why |
|---|---|---|
| P1 | **Relevance over reach.** Nobody receives something that isn't about *their* child, team, fixture or job, or something they chose to follow. There is no general-purpose broadcast. **One exception: ScoreKeeper itself** may tell users about something important, such as a significant new feature or a change to terms, through a system channel (§2.3). Kept to a minimum. | D6 won distribution and lost attention, because breadth is what cost it. Relevance is the one thing we can do that a newsletter tool cannot, because we hold rosters and fixtures. |
| P2 | **The audience comes from data, not from a hand-kept list.** Most audiences come from rosters, squads and guardian links, worked out at send time. **Following** an org or a team is the other source: a user opts in and joins that subject's public channels. That is broader than a roster, but it is still data the app holds, not a list somebody maintains. | A school does not know who is in its class groups. A WhatsApp group goes stale as soon as a squad changes. |
| P3 | **For a parent, the unit is the person.** A user sees their messages **per person**: messages about themselves, and messages about each child, clearly told apart. One child's school and club messages sit together. | Children play at school and at clubs, so a parent assembles their week from several organisations. |
| P4 | **All communication is attached to something.** Every message lives in a channel that belongs to a subject (an org, team, fixture or tournament), and it lives as long as that subject does (§2). A changed kick-off *is* a change to the fixture, and the notice comes from that change. | Text in a group chat scrolls away, and the schedule goes out of date. |
| P5 | **Anything that asks a question gets back a tally, a list of who hasn't answered, and late changes.** This is the survey service (§7). | The bus problem and the selection problem are both "we don't know who has seen this and what they said". |
| P6 | **The notification itself carries the information, and always links to its subject.** The pop-up says "Saturday 09:00 at Bishops, Field 4A", and tapping it opens the fixture. That applies equally to the copy forwarded to email or WhatsApp. | The parent reads D6 only as a pop-up. Assume most people never open the app. |
| P7 | **The responsible party answers for a player** — guardians for a minor who has them, otherwise the player ([identity_structure.md](file:///c:/Fred/Coding/SK/docs/identity_structure.md) §5.3). | Already settled and built. Communication is its main user. |
| P8 | **No one can get another person's contact details from the app.** No cellphone number and no email address, ever, through any channel, member list or conversation. Who may contact whom is set out in §5. | A group chat exposes every member's number to everyone in it. |
| P9 | **What was agreed stays on record.** Archived, not deleted (§9). | The disputed interschools date. |
| P10 | **Feed WhatsApp; don't try to replace it.** For now that means a person copying a message into their group by hand. There is no direct WhatsApp integration (C24, §8.3). We win on what a chat can't do (P2, P4, P5, P9), not by being another chat. | WhatsApp works and everyone already has it. |

## 2. Channels

**A channel is the one place messages live.** Every channel belongs to a **subject**. For each
channel we need to know:

- **Who receives it:** its audience rule.
- **Who may post:** its posters.
- **Whether replies are allowed:** set **per channel, not per message**.
- **Who runs it:** its owner and its admins (below).
- **When it ends:** its lifetime.

A subject can have **several channels**, each with its own audience and rules.

**Owner and admins (C21).** A channel's **admins** are everyone who can control it. They post, set
its rules within the limits in §4, see answers and receipts, and can be contacted privately (§3).
The **owner** decides who the admins are, and may include coaches, managers or other staff (C27):

- **Default owners:** the team's coach for a team's channels, the org admins for an org's channels,
  and the organisers for a tournament's.
- **A fixture's channels take their admins from the team's channels.** When the coach is away, the
  assistant is already an admin.
- **The cross-org Match staff channel has no single owner.** Each team's admins and the game's
  officials are all its admins.
- **An owner can hand ownership over, and org admins can always reassign it**, so a coach who leaves
  never strands a channel.
- **Org admins can read all their organisation's channels, but not private conversations** (C28).
  A minor's conversations are covered by the guardian (C14). Any other private conversation can be
  retrieved from the archive, but only by a system admin (§9).

### 2.1 Channels per subject (proposed set)

| Subject | Channel | Audience | Posts | Replies | Lifetime |
|---|---|---|---|---|---|
| **Team** | Public | Followers of the team, plus everyone below | Team staff | **Never.** Broadcast only (C6) | As long as the team |
| | Players | Players, or their responsible parties, plus Trusted Contacts for what their grant allows | Team staff | If the team allows it | A member's access ends when they leave the team |
| | Staff | The team's coaches, managers and assistants | Staff | Yes | As long as the team |
| **Fixture** | Squad | That game's selected squad, through their responsible parties | Team staff | If the team allows it | Ends with the fixture, then archives |
| | Match staff (cross-org) | Both teams' staff and the game's officials | Any of them | Yes | Ends with the fixture |
| **Organisation** | Public | The org's followers and members | Org admins | Never | As long as the org |
| | Members | All members, or their responsible parties | Org admins, maybe heads of code | Org setting | While a member |
| | Staff | Org staff, maybe split by role | Staff | Yes | While staff |
| **Tournament / event** | Participants (cross-org) | Each participating org's **main contact**, plus the organisers | Organisers | Yes | Ends with the event |
| | Public | The event's followers, and entrants' responsible parties | Organisers | Never | Ends with the event |
| **ScoreKeeper** | System | Every user | ScoreKeeper only | Never | Ongoing; messages expire |

Other subjects fit the same pattern when they exist: a division, a team event or training session,
a survey (§7).

### 2.2 Posting

- **One announcement can go to several channels at once.** For example: "Kick-off moved to 10:00"
  goes to the team's Players channel *and* its Public channel. It is still one message, so editing
  or withdrawing it applies everywhere.
- **Replies follow each channel's own rule** (C3). Players may reply in their channel if the team
  allows it. Followers in the Public channel cannot reply.
- **Notices generated from data** (selection, a moved kick-off, a cancellation, a final result)
  post themselves into the right channels. Nobody writes them.

### 2.3 The ScoreKeeper channel

Every user has it and cannot leave it. **Only system admins post to it** (C19). It is used rarely:
significant features, terms and safety. **It is not for marketing.** **At most one message a month**,
except for terms and safety. **Only messages flagged as important send a push notification**; the
rest wait in the channel (C33).

## 3. Direct conversations

Two-way private messaging exists, but only **between a channel's members and its admins** (C4):

- **A member can start a private conversation with any admin** of a channel they belong to. A parent
  in a team's Players channel can message the coach or the team manager. **Members never message
  each other**: a parent cannot message another parent.
- **An admin can start a private conversation with any member** of their channel, or reply to one
  privately. For example, a parent asks something in the Players channel that shouldn't be answered
  in public.
- **Every conversation is linked to the channel it came from.** It starts from there: a
  **"Message the coach"** button on the team page, or "reply privately" on a message. The coach
  sees it as a direct conversation with that org member, labelled with the channel and the player
  it concerns (P3).
- **Each admin decides whether members can contact them** (C29), within the limits the org and team
  set (§4). It is **on by default** wherever the org allows it. An admin who is not contactable can
  still start conversations themselves.
- **A conversation is between the member and the one admin they chose.** A "message all the team's
  staff" option may come later.
- **Both people see the whole conversation.** Receipts are visible to both.
- **A guardian can read their child's conversations** (C14).
- **When an admin stops being one, or the channel ends**, their conversations close and archive.

## 4. Who sets the rules: policy levels

Rules are set at several levels, and **a lower level can only narrow what a higher level allows**.
It can never widen it (C11).

| Level | Who | Examples of what they set |
|---|---|---|
| **Org** | Org admins | Whether coaches may be contacted directly at all; whether Players channels may allow replies; whether minors may use messaging (§10); mandatory email forwarding for members (§8.3); who may post to the org's channels |
| **Team** | The team's coach | Whether replies are allowed in this team's Players channel; whether they are contactable directly |
| **Channel** | Its owner and admins | Within the team's rules: pinning, closing a channel early |
| **Person** | Guardian, or an adult player | Whether *their minor* may message the coach (§10); their own notification and forwarding preferences (§8) |

For example: an org can switch direct contact with coaches off for everyone. A coach at an org that
allows it can still choose not to be contactable. A coach at an org that forbids it cannot switch it
on.

**There is no sport or head-of-code level for now** (C22). Rules are set at org level, team level or
lower. If a sports office later wants one setting for every netball team, that is a level that can
be added between org and team without changing the rest.

## 5. Who may contact whom

**The rule, from C4 and C5:** you can reach someone only through a channel you share. To everyone,
you post in the channel. To one person, you start a private conversation, which is only possible
between a channel's admins and its members. Nobody ever sees contact details.

| Sender ↓ / Recipient → | Members of a channel they administer | One member of that channel | Other teams' people | Another org's staff | Followers |
|---|---|---|---|---|---|
| **Channel admin** (coach, team staff, org admin, organiser) | Post in the channel | **Yes**, a private conversation linked to the channel | No | Only in a fixture or tournament channel (C7) | Via a Public channel |
| **Member** (parent, guardian, adult player) | Reply in the channel, if it allows replies | **No**, except to the channel's admins | No | No | No |
| **Minor** | Reply in the channel, if their guardian and the org allow it (§10) | Only the channel's admins, if allowed | No | No | No |
| **Follower / supporter** | No | No | No | No | **No.** Broadcast only (C6) |

**A coach messages only their own players directly** (C26). To call a U12 player up to the U13s,
the U13 coach selects them, and the selection notice reaches the player or their guardian. The coach
cannot message them until they share a channel.

**People without an account** (C30):

- **Officials** belong to the game's Match staff channel. An official with no account receives its
  messages by email.
- **Main contacts with only an email address** (often for organisations nobody has claimed) receive
  the tournament's messages by email, with a link to sign in and reply. **Replying by email is not
  supported.** The server would have to receive and parse incoming mail.

## 6. Kinds of message

| Kind | Who writes it | Answer expected? | Examples |
|---|---|---|---|
| **Notice** | Nobody. Generated from a change in the data | No | Selected / dropped; kick-off moved; cancelled; venue changed; result final; attendance marked; reminder the evening before; invite or claim |
| **Announcement** | A person, posted to one or more channels | Replies only if the channel allows | "Bring both kits on Saturday"; festival day information; "parking is at gate 3" |
| **Survey** | A person asks a set question | Yes, structured (§7) | Who is taking the bus; availability; "are you interested in a holiday camp?"; feedback on an idea; selection acknowledgement |
| **Conversation message** | People, two-way | Free text | A reply in a channel; a direct conversation with the coach |

## 7. Surveys

**One general service, not a transport form** (C13). It generalises the "Polls" entry in
FUTURE_IDEAS.

- **A survey is:** one or more questions, an audience, a deadline, and the channel it is posted in.
  **For now a survey always belongs to one channel** (C23), and its audience is that channel's
  members or part of them.
- **Uses:**
  - Logistics: bus there and back, availability, which practice slot, kit size
  - Interest: "would your child join a holiday hockey camp?"
  - Feedback on an idea
  - Volunteers: tuck shop, driving
  - **Selection acknowledgement:** "is he coming?" is a one-question survey generated from the
    squad.
- **For a minor, the responsible party answers** (P7). A Trusted Contact answers only if their grant
  includes Respond, and the answer is recorded as "on behalf of".
- **What the creator sees:** the full result, **per person** (C23), unless the survey is anonymous.
  - A live tally
  - **Who has not answered**, with a "chase" that re-notifies only them
  - **Answers changed after the deadline**, flagged rather than discovered at the bus
- **What respondents see:** the creator chooses whether they see the **totals**. They never see
  anyone else's answer.
- **Anonymous surveys are an option the creator can choose** (C25). By default the creator and the
  channel's admins see who answered what. In an anonymous survey they see only totals. Proposed
  details:
  - **Whether it is anonymous is fixed when the survey opens**, and shown to respondents before they
    answer. Changing it afterwards would break the promise.
  - **The app still records who has answered**, so nobody answers twice and a chase reaches only
    those who haven't. But **the creator doesn't see the names**, only the count. In a squad of 12, a
    list of the 3 who haven't answered gives away too much.
  - **No per-person flags on late changes.** Only "4 answers changed after the deadline".
- **Templates**, so a coach doesn't rebuild the transport survey every week. A template can be
  re-run for each fixture. That is the "one poll per team by hand" pain.

- **Question types** (C32): single choice, multiple choice and free text. A number answer may come
  later.

Later:
- **Several channels at once.** The sports office's case is every team in a code going to the same
  away fixture. For now that means one survey per channel. Worth revisiting once surveys exist,
  perhaps as "run this template in these channels".

## 8. Delivery

### 8.1 In-app

Every message and notice creates a **notification record per recipient**. The record is what
"delivered", "seen" and "answered" are measured against. It always links to its subject (P6).

### 8.2 The inbox

**Shape C (C1): one inbox of pointers; the content lives in its channel.** A new message in a
channel, a reply in a direct conversation, a survey to answer or a fixture change each produce one
inbox entry, which opens the thing itself.

- **Grouped or filterable per person** (P3): "Me", and each child. Each entry shows who it is about.
- **Channel list.** Long-lived channels (a team's Players channel) also need to be findable without
  waiting for a notification. Proposed: a person's view lists their channels by subject, under each
  person, much like the WhatsApp Community umbrella the Tableview minis use. To mock up.

### 8.3 Forwarding to email, and WhatsApp

- **A user may choose** to receive a copy of their in-app notifications by **email**. Each copy
  repeats the message and links back to it in the app (P6). The choice is per channel or kind, with
  a default.
- **An org may require it for its members**, for example "every member receives our messages at
  their registered email". **A member cannot switch a required copy off, but can switch it to the
  digest** (C31). This still needs checking against consent rules and POPIA before it is built.
- **Digest** (C16): instead of one copy per message, a daily or weekly summary. **Surveys with a
  deadline and change notices are always sent at once**, even to someone on a digest.

**WhatsApp: no direct integration for now (C24).** A message is copied into a WhatsApp group by
hand. A cheap help that stays within that decision is a **"copy for WhatsApp"** action on a message:
it puts the text and the link to the message on the clipboard, or opens the phone's share sheet. The
same idea is behind the shareable-results task in TODO.md.

Why, checked 2026-10-04:

- **Posting into a club's existing WhatsApp group is not possible** through WhatsApp's official
  business platform. Its Groups API only works with groups the business itself creates, capped at
  **8 participants**, which people must join by tapping a link. Unofficial tools that automate a
  normal WhatsApp account get around this, but they break WhatsApp's terms and risk the number being
  banned.
- **Messaging an individual** on WhatsApp is possible. It needs the person's opt-in and pre-approved
  message templates, and **each message costs money**, which sits badly with communication being
  part of the base product (C9). Worth revisiting if users ask for it once forwarding by email
  exists.

Sources:
[imbee — WhatsApp Groups API business guide 2026](https://www.imbee.io/resource/whatsapp-groups-api-business-guide-2026),
[Periskope — Groups API requirements and limits](https://periskope.app/blog/whatsapp-groups-api-requirements-eligibility-limits),
[Unipile — WhatsApp Group API 2026](https://www.unipile.com/whatsapp-group-api/).

### 8.4 Push and preferences

- Push to the phone is the main channel. None of it exists yet: no device tokens, no sending service.
- **Muting** (C31). These **cannot be muted**:
  - A survey that is waiting for your answer
  - Selection, change and cancellation notices about your own fixtures
  - The ScoreKeeper channel

  Everything else can be muted, and a public channel can be unfollowed.
- **Quiet hours**, so nobody gets a fixture reminder at midnight.

## 9. Lifetime, expiry and archive

- **Every channel ends with its subject.** A fixture's channels close when the fixture is done. A
  member loses a team's Players channel when they leave the team.
- **Every message expires** after a time that depends on its kind (C10, C34):

  | Kind | Leaves the app |
  |---|---|
  | Notices | 30 days after the fixture or change |
  | Announcements and channel messages | End of the season |
  | Survey results | One year after the survey closes |
  | Private conversations | One year after the last message |

- **Expired is archived, not deleted.** It stays in the database (P9, and for safeguarding
  complaints), but is no longer shown in the app.
- **Who can retrieve an archive** (C34):
  - **Org admins** can retrieve their own organisation's archived **channel** messages. That is the
    record of what was agreed (P9).
  - **Private conversations** come out of the archive only through a **system admin**, on a
    safeguarding or dispute request.
- **Final deletion is a system admin action, not automatic** (C35). Nothing is deleted on a timer
  for now. Before production, the retention period still needs checking against POPIA's rule
  against keeping personal data longer than needed, and against how long schools must keep
  safeguarding records. Automatic deletion can follow once that is known.
- **An "Archived messages" section in the app's system admin area** (C35) is where a system admin:
  - Finds archived channels and conversations by organisation, channel, person and date
  - Retrieves one in answer to a safeguarding or dispute request. **Every retrieval is logged**:
    who, when, and the request it answered.
  - Deletes archived material, individually or in bulk by age. Deletion is logged too, so there is
    a record that it was done.

  Org admins' retrieval of their own channels happens in the organisation's admin area, not here.

## 10. Minors

- **A minor's messages go to their responsible party** (P7). A minor without member access receives
  nothing directly.
- **Whether a minor may message their coach** is a setting the **org** allows or forbids. Within
  that, the **guardian** decides for their child (C15). A guardian can only permit contact with the
  coach of a team the child is in.
- **A guardian can read every conversation of their minor** (C14). That is the safeguarding answer to
  "a private adult–child conversation". Such a conversation is never private from the guardian.
- **A minor as an official or scorer**, such as a U16 referee, still receives what that duty needs.

## 11. Organisations and the parent: who sees what

**The parent sees everything about their child; each organisation sees only its own** (C8). A
parent's view combines the school's and the club's channels for one child. The school never sees the
club's messages, and the club never sees the school's.

## 12. Candidate features mapped onto the model

The candidates from FUTURE_IDEAS and round 1, so we can see the whole solution. Not yet ranked or
cut into parts.

| Feature | Built on | Depends on |
|---|---|---|
| Channels per subject, with policy levels | §2, §4 | — (the foundation) |
| Inbox per person, channel list, forwarding, digest | §8 | Push, a production email service |
| Selection notice + acknowledgement | Notice + survey | Channels, `MEMBER-6` |
| Fixture change / cancellation notices carrying the change | Notice | Channels |
| Evening-before reminder with time, venue, field and kit | Notice | Kit per code |
| Surveys, transport first | §7 | Channels, `MEMBER-6` |
| Attendance marking, visible to the guardian | Notice | Team event / training |
| Kit and uniform requirements per sporting code | Content shown in notices and views | — |
| One view of everything one child plays | Inbox per person, P3 | Consumer side |
| Festival / tournament day view | Tournament Public channel + a view | Tournament-scoped site map |
| Following an org or team | Public channels | — (only `UserPreferences.followedTeams` exists) |
| "Message the coach" | §3 | §4, §10 |
| Tournament main contacts, cross-org record of what was agreed | Tournament Participants channel | Main contact role |
| Trusted Contacts receiving their granter's view | Audience rule | `MEMBER-5` |
| ScoreKeeper system channel | §2.3 | System admin posting |
| "Copy for WhatsApp" on a message | §8.3 | Shareable-results task in TODO.md |
| Moderation of channels and conversations | Reporting a message | `REP-*` |
| Archived messages (system admin): find, retrieve, delete, with an audit log | §9 | Archiving |
| An org's own archived channels (org admin) | §9 | Archiving |

## 13. Not doing

- **Open chat for supporters** (C6). Followers only receive broadcast channels.
- **Messaging between members of a channel**, such as parent to parent (C4).
- **Newsletters** and general school-wide broadcast (P1).
- **Replacing WhatsApp** (P10), and **any direct WhatsApp integration** for now: posting into
  groups, or forwarding to a user's WhatsApp (C24).
- **Rules per sport or head of code** (C22).
- **Live bus location.** It shares the location of a vehicle full of minors, so it is a
  safeguarding question before it is a feature.
- **Voice and video.**

## 14. What exists today

- A `notifications` table (`user_id`, title, message, type, link, read flag) in
  [init-db.ts](file:///c:/Fred/Coding/SK/server/src/scripts/setup/init-db.ts), and
  [NotificationManager.ts](file:///c:/Fred/Coding/SK/server/src/managers/NotificationManager.ts)
  with create, list, mark-read and delete, plus three socket actions. It is one row per user, with no
  "about which person", no subject reference other than a `link` string, and no answer. No screen in
  `expo-app/` shows it. It is likely to be replaced rather than extended.
- [EmailService.ts](file:///c:/Fred/Coding/SK/server/src/services/EmailService.ts). There is no
  production mail service yet (FUTURE_IDEAS).
- Guardian links, and the rule for who answers for a player
  ([guardians.ts](file:///c:/Fred/Coding/SK/shared/src/utils/guardians.ts)).
- Rosters, game squads, officials, and an org's public fixtures room. These are the sources for
  channel audiences.
- `UserPreferences.followedTeams`, a bare list with nothing behind it.
- No push, no device tokens, no channels, no messaging, no consumer-side app.

## 15. Decisions

Rounds 1 (C1–C18) and 2 (C19–C24) were on 2026-10-04, and round 3 (C25–C35) on 2026-10-05. Where a
later round changed an earlier decision, the entry says so.

| # | Decision |
|---|---|
| C1 | **Inbox shape C.** The inbox holds pointers, and content lives in channels on subjects. |
| C2 | **Communication happens in channels attached to subjects.** A subject can have several channels, each with its own audience, posters, reply rule, owner and admins, and lifetime. |
| C3 | **Replies are allowed or not per channel**, not per message. One message posted to several channels follows each channel's rule. |
| C4 | **Private conversations happen only between a channel's admins and its members**, never between members. A member may start one with any admin. An admin may start one with any member, or reply privately. The conversation is linked to its channel. *Round 2 widened this from "only with the owner".* |
| C5 | **No contact details are ever exposed** through the app. |
| C6 | **Supporters and followers receive broadcast-only channels.** No chat for them. |
| C7 | **Cross-organisation communication happens only in the context of a fixture or a tournament.** |
| C8 | **The parent sees everything about their child; each org sees only its own.** |
| C9 | **Communication is part of the base product.** It isn't sold separately. |
| C10 | **Messages expire and are archived.** Kept in the database, gone from the app. Lifetimes are set per kind. |
| C11 | **Rules cascade downward.** Org, then team, then channel, then person. A lower level can only narrow what a higher level allows. |
| C12 | **ScoreKeeper may message all users** through a system channel, kept to a minimum. |
| C13 | **Surveys are a general service**: interest, feedback and logistics alike. |
| C14 | **A guardian can read their minor's conversations.** |
| C15 | **A minor may message their coach only if the org allows it and the guardian permits it.** |
| C16 | **Users may have notifications forwarded to email**, and an org may require it for its members. A digest is offered. *Round 2 removed WhatsApp forwarding (C24).* |
| C17 | **Receipts are visible to a channel's admins.** In a direct conversation, both people see them. |
| C18 | **Every message links to its subject in the app**, including forwarded copies. |
| C19 | **Only system admins post to the ScoreKeeper channel.** |
| C20 | **An admin can reply privately** to a channel member's message. Folded into C4. |
| C21 | **A channel's admins are everyone who controls it**, chosen by its owner. They can include coaches, managers and other staff. |
| C22 | **No rules per sport or head of code for now.** Policy is set at org level, team level or lower. |
| C23 | **Surveys belong to one channel.** The creator sees every answer per person and chooses whether respondents see the totals. Respondents never see anyone else's answer. |
| C24 | **No direct WhatsApp integration for now.** Messages are copied to WhatsApp by hand. |
| C25 | **Anonymous surveys are an option.** The default is that the creator and admins see who answered what. *Round 3 (2026-10-05) amended C23.* |
| C26 | **A coach messages only their own players directly.** Players in other teams are reached through selection. *Round 3.* |
| C27 | **Channel ownership** (§2). Default owners are the coach for a team, the org admins for an org and the organisers for a tournament. Fixture channels take the team's admins. The cross-org Match staff channel is run jointly by both teams' admins and the officials. Owners can hand over, and org admins can always reassign. *Round 3.* |
| C28 | **Org admins can read all their org's channels, but not private conversations.** *Round 3.* |
| C29 | **Each admin can switch off being contacted** (on by default where the org allows it). A conversation is with one chosen admin. When an admin leaves or the channel ends, their conversations close and archive. *Round 3.* |
| C30 | **People without an account take part by email**: officials in the Match staff channel, and email-only main contacts in a tournament. They reply by signing in, not by email. *Round 3.* |
| C31 | **Some things can't be muted**: surveys awaiting your answer, notices about your own fixtures, and the ScoreKeeper channel. Org-required email copies can't be switched off, only moved to the digest. *Round 3.* |
| C32 | **Survey question types**: single choice, multiple choice and free text. *Round 3.* |
| C33 | **The ScoreKeeper channel** is used at most once a month, except for terms and safety, and only important messages send a push notification. *Round 3.* |
| C34 | **Lifetimes and retrieval** (§9). Notices leave the app after 30 days, channel messages at season end, survey results and private conversations after a year. Org admins retrieve their own channels; private conversations only through a system admin. *Round 3.* |
| C35 | **Final deletion is a system admin action, not automatic**, done from an Archived messages section in the system admin area. Retrievals and deletions are logged. *Round 3.* |

## 16. Open questions

None open after round 3. Two checks remain before anything reaches production:

1. **POPIA and safeguarding record-keeping** against the retention in §9 and the required email
   copies in §8.3.
2. **The ScoreKeeper channel's posting rules** (§2.3) written down as a short policy before the first
   post.

Smaller design points left for the mockups and the build to settle: the channel list on a person's
view (§8.2), quiet hours (§8.4), and surveys across several channels (§7).

## 17. Next steps

1. Confirm the feature list (§12).
2. Mock up the per-person inbox, a team's channels and a survey, in `mockups/`.
3. Cut the whole into parts that can be built one at a time, and log them in TODO.md.
