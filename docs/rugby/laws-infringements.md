# Rugby Infringements and Their Sanctions

Working reference for `SCORE-11` — the end-to-end review of rugby's `reasons` lists. It catalogues
the infringements in the Laws of the Game, the sanction each one carries, and where on the field it
happens, so the review session has something concrete to argue with instead of memory.

**Parts 1–3 are reference; Parts 4–6 are the decisions and the spec.** Nothing has been applied to
[rugby.seed.ts](file:///c:/Fred/Coding/SK/server/src/scripts/setup/seeds/sports/rugby.seed.ts) yet.
Part 1 catalogues the law, Part 3 measures the seed against it, Part 4 records the seven decisions
(all answered 2026-08-18), Part 5 works out which law lands on which reason, and **Part 6 is the
list of ids to write** — read that one if you are doing the edit.

## Reviewing it

`npm run review:rugby` serves this document at `http://localhost:4173` as a readable page with a
comment box against every table row, gap and decision — the markdown source is awkward to annotate
by hand. What you type autosaves to `laws-infringements.comments.json` beside this file, keyed by
section and row title, which is where an agent reads your comments from. The **Comments** column in
the tables below is where they eventually get merged; that merge is a deliberate step, never
automatic. See [scripts/rugby-review.js](file:///c:/Fred/Coding/SK/scripts/rugby-review.js).

## Provenance and accuracy

Sourced from the World Rugby Passport law-by-number pages (2026 laws, incorporating the changes
effective 1 July 2026: brake foot at all levels, the 20-minute red card as full law, the TMO role,
community tackle height, and the in-goal restart changes that moved some 22m drop-outs to try-line
drop-outs).

Two warnings before anyone treats a row as authoritative:

- **Clause numbers are indicative.** They were read off the Passport pages in one pass and have not
  been checked line by line against the PDF. Treat them as a pointer to the right law, not a
  citation.
- **Sanctions are the thing to check.** Whether an offence is a penalty or a free kick is the whole
  point of this document, and a handful in Law 19 (scrum) sit close enough to that line that a
  referee should confirm them. They are flagged with a warning marker below.

Primary sources: [Law 9 Foul play](https://passport.world.rugby/laws-of-the-game/laws-by-number/9-foul-play/),
[10 Offside](https://passport.world.rugby/laws-of-the-game/laws-by-number/10-offside-and-onside-in-open-play/),
[11 Knock-on](https://passport.world.rugby/laws-of-the-game/laws-by-number/11-knock-on-or-throw-forward/),
[12 Kick-off and restarts](https://passport.world.rugby/laws-of-the-game/laws-by-number/12-kick-off-and-restart-kicks/),
[14 Tackle](https://passport.world.rugby/laws-of-the-game/laws-by-number/14-tackle/),
[15 Ruck](https://passport.world.rugby/laws-of-the-game/laws-by-number/15-ruck/),
[16 Maul](https://passport.world.rugby/laws-of-the-game/laws-by-number/16-maul/),
[17 Mark](https://passport.world.rugby/laws-of-the-game/laws-by-number/17-mark/),
[18 Touch and lineout](https://passport.world.rugby/laws-of-the-game/laws-by-number/18-touch-quick-throw-and-lineout/),
[19 Scrum](https://passport.world.rugby/laws-of-the-game/laws-by-number/19-scrum/),
[20 Penalty and free-kick](https://passport.world.rugby/laws-of-the-game/laws-by-number/20-penalty-and-free-kick/),
[21 In-goal](https://passport.world.rugby/laws-of-the-game/laws-by-number/21-in-goal/),
[2026-07 law updates](https://passport.world.rugby/laws-of-the-game/whats-new/2026-07-law-updates/).

## How to read the tables

| Column | Meaning |
| --- | --- |
| **Infringement** | Plain-language name, phrased the way a scorer would pick it. |
| **Law** | Indicative clause. |
| **Sanction** | What the referee awards. This decides which template the reason belongs on. |
| **Player?** | Whether an individual is at fault. Feeds `specifyPlayer` on the reason option — `yes` shows the player picker, `no` (a unit offence: a collapsed scrum, a lineout with too many players) skips it. |
| **Today** | The reason id in the seed that already covers this, or `—` if nothing does. |
| **Comments** | Left blank for you. Write decisions, doubts and "drop this one" notes straight into the row rather than quoting the line back in chat. |

A note on the sanction vocabulary, because the laws use more of it than our templates do:

- **Penalty** and **Free kick** map to `penalty_awarded` and `free_kick`, both recorded against the
  offending team.
- **Scrum** maps to a reason on the `scrum` template. Note that a scrum has two quite different
  kinds of cause: an infringement that is *itself* a scrum offence (a knock-on), and a scrum
  *elected* by the non-offending team from a penalty or free kick — which is already modelled as the
  `penalty_awarded` → `scrum` outcome carrying `triggerEventData.reason`.
- **Choice** — several restart offences give the non-offending team a menu (retake / scrum /
  lineout). We have no way to record which was taken; see decision D5.
- **Card** always accompanies a penalty or a penalty try. It is never a sanction on its own, which
  is the root of decision D1.

---

# Part 1 — Infringements by phase

## 1.1 Tackle

| Infringement | Law | Sanction | Player? | Today | Comments |
| --- | --- | --- | --- | --- | --- |
| Tackle above the sanction line (head/neck contact) | 14.5a, 9.13 | Penalty | yes | `high_tackle` (on `yellow_card` only) | Can name this dangerous tackle and it should be added to penalty as well. |
| Tackler does not release the ball-carrier | 14.5b | Penalty | yes | — | Rename: Tackler not releasing |
| Tackler does not roll away / move away | 14.5c | Penalty | yes | `not_rolling` | Rename: Tackler not rolling away |
| Tackler plays the ball without getting to their feet | 14.5d | Penalty | yes | `off_feet` | Rename: Ball played on ground |
| Tackler prevents the tackled player releasing or playing the ball | 14.5e–f | Penalty | yes | — | Rename; Tackler not releasing |
| Tackled player does not release or make the ball available | 14.7a | Penalty | yes | `not_releasing` | Rename: Not releasing the ball |
| Tackled player does not move away from the ball | 14.7b | Penalty | yes | — | Rename: Not releasing the ball |
| Tackled player lies on or over the ball (sealing off) | 14.7c | Penalty | yes | — | Rename; Not releasing |
| Arriving player off their feet | 14.8a–b | Penalty | yes | `off_feet` | Rename: Off feet |
| Arriving player enters from the side | 14.8c | Penalty | yes | `side_entry` | Rename: Side entry |
| Playing the ball while on the ground at the tackle | 14.8d | Penalty | yes | — | Rename Playing on the ground |
| Croc roll — rolling, pulling or twisting a player at the tackle | 14.8e, 9.20d | Penalty | yes | — | Rename: Croc roll |
| Offside at the tackle | 14.8f | Penalty | yes | `offside` | Rename: Offside |
| Player on their feet does not play the ball immediately | 14.9a | Penalty | yes | — | Rename: Other |
| Going to ground at or near the tackle without being tackled | 14.9b | Penalty | yes | — | Rename: Other |
| Late tackle | 9.13 | Penalty | yes | `late_tackle` | Rename: Tackle without ball |
| Early tackle | 9.13 | Penalty | yes | — | Rename: Tackle without ball |
| Dangerous tackle (general) | 9.13 | Penalty | yes | `dangerous_tackle` | Rename: Dangerous tackle |
| Tackling a player who does not have the ball | 9.14 | Penalty | yes | — | Rename/: Tackle without ball |
| No-arms tackle / shoulder charge | 9.16 | Penalty | yes | — | Rename: Dangerous tackle |
| Tackling a player whose feet are off the ground | 9.17 | Penalty | yes | — | Rename: Tackle in the air |
| Tip tackle / lifting and dropping a player | 9.18 | Penalty | yes | `tip_tackle` (on cards only) | Rename: Tip Tackle |
| Charging or late-tackling the kicker | 9.25 | Penalty | yes | — | Rename: Dangerous tackle |
| Hand-off with excessive force | 9.24 | Penalty | yes | — | Rename: Other |
| Flying wedge | 9.22 | Penalty | no | — | Rename: Dangerous tackle |

## 1.2 Ruck

| Infringement | Law | Sanction | Player? | Today | Comments |
| --- | --- | --- | --- | --- | --- |
| Head and shoulders below hips at the ruck | 15.3 | **Free kick** | yes | — | Rename: Other |
| Joining off feet, or from in front of the offside line | 15.5 | Penalty | yes | `side_entry` | Rename: Illegal entry |
| Joining in front of the hindmost player | 15.6 | Penalty | yes | `side_entry` | Rename: Illegal Entry |
| Joining without binding | 15.7, 9.20a | Penalty | yes | — | Rename: Illegal entry |
| Not joining and not retiring behind the offside line | 15.8–15.9 | Penalty | yes | `offside` |  |
| Handling the ball in the ruck | 15.11 | Penalty | yes | `hands_in_ruck` |  |
| Failing to stay on feet in the ruck | 15.12 | Penalty | yes | `off_feet` |  |
| Playing the ball while alongside rather than bound in | 15.13 | Penalty | yes | — | Rename: Other |
| Picking the ball up with the legs | 15.16a | Penalty | yes | — | Rename: Other |
| Intentionally collapsing the ruck or jumping on it | 15.16b, 9.20c | Penalty | yes | — | Rename: Collapsing |
| Stepping on a player | 15.16c | Penalty | yes | — | Rename: Dangerous Play |
| Falling on or over the emerging ball | 15.16d | Penalty | yes | — | Rename: Other |
| Kicking, or trying to kick, the ball out of the ruck | 15.16e | Penalty | yes | — | Rename: Other |
| Returning the ball into the ruck | 15.16f | **Free kick** | yes | — | Rename: Other |
| Falsely indicating the ruck has ended | 15.16g | **Free kick** | yes | — | Rename: Other |
| Preventing an opponent playing the ball away | 15.18 | Penalty | yes | — | Rename: Offside |
| Contact above the shoulder line at the ruck | 9.20b | Penalty | yes | — | Rename Dangerous Play |
| Dropping weight onto a player / targeting the lower limbs | 9.20e | Penalty | yes | — | Rename: Dangerous play |
| Ball unplayable in the ruck | 15.20 | **Scrum** (team moving forward) | no | `unplayable` |  |

## 1.3 Maul

Not represented at all in the current templates — see gap 3.1.

| Infringement | Law | Sanction | Player? | Today | Comments |
| --- | --- | --- | --- | --- | --- |
| Illegal rip — losing contact, or a long-arm transfer | 16.2 | Penalty | yes | — | Rename: Other |
| Joining from an offside position / not retiring | 16.5 | Penalty | yes | — | Rename: offside |
| Leaving the maul without retiring behind the offside line | 16.6 | Penalty | yes | — | Rename: offside |
| Joining ahead of the hindmost player | 16.7a | Penalty | yes | — | Rename: Illegal entry |
| Joining without binding on the hindmost player | 16.7b | Penalty | yes | — | Rename: Illegal Entry |
| Head and shoulders below hips when joining | 16.7c | **Free kick** | yes | — | Rename: Illegal Entry |
| Players other than the ball-carrier going to ground | 16.9 | Penalty | yes | — | Rename: Collapsing |
| Truck-and-trailer — obstruction by a player not bound in | 16.10 | Penalty | yes | — | Rename: Obstruction |
| Intentionally collapsing or jumping on the maul | 16.11a, 9.20c | Penalty | yes | — | Rename: Collapsing |
| Pulling or dragging a player out of the maul | 16.11b | Penalty | yes | — | Rename: Other |
| Falsely indicating the maul has ended | 16.11c | **Free kick** | yes | — | Rename: Other |
| Defender rejoining without binding on the frontmost player | 16.13 | Penalty | yes | — | Rename: Illegal Entry |
| Interfering with an opponent trying to play the ball | 16.18 | Penalty | yes | — | Rename:  Other |
| Ball-carrier goes to ground without making the ball available | 16.8, 16.17d | **Scrum** | no | `unplayable` | Rename: Turnover |
| Maul unplayable, collapses, or is stationary with no ball out | 16.17a–c | **Scrum** | no | `unplayable` | Rename: Turnover |
| Ball not used within 5s of the "use it" call | 16.14, 16.17e | **Scrum** | no | `unplayable` | Rename: Turnover |

## 1.4 Scrum

The scrum is where the penalty/free-kick split is least intuitive, and where our `scrum_other`
catch-all is hiding the most detail. Broadly: **procedural** offences (timing, foot position, the
brake foot, the feed, the strike) are free kicks, and **binding, pushing and safety** offences are
penalties.

### Free kick

| Infringement | Law | Player? | Today | Comments |
| --- | --- | --- | --- | --- |
| Not ready to form the scrum within 30 seconds | 19.4 | no | — | Rename: Time wasting |
| Head or shoulders lower than hips at engagement | 19.10a | no | — | Rename: Illegal scrumming |
| Head not to the left of the opponent's | 19.10b | yes | — | Rename: Illegal scrumming |
| Brake foot not correctly set, or adjusted illegally ⚠ | 19.10c, 19.11e | no | — | Rename: Illegal Scrumming |
| Brake foot not removed on "set" | 19.12a | no | — | Rename:: Illegal scrumming |
| Not in position and ready to push | 19.12b | no | `pre_engagement` | Rename: Illegal Scrumming |
| Front-row foot position incorrect | 19.12c–d | no | — | Rename: Illegal scrumming |
| Ball thrown in from the wrong side | 19.15a | yes | — | Rename: Illegal Feed |
| Ball thrown in from inside the tunnel | 19.15b | yes | — | Rename: Illegal Feed |
| Delaying the feed | 19.15c | yes | `delaying_feed` | Rename: Illegal Feed |
| Feed not a single forward movement, or not quick | 19.15d–e | yes | — | Rename: Illegal Feed |
| Feed not straight | 19.15f | yes | `illegal_feed` | Rename: Illegal Feed |
| Ball's first contact outside the tunnel | 19.15g | yes | — | Rename: Other |
| Pushing before the ball leaves the scrum-half's hands | 19.17 | no | `early_push` |  |
| Striking before the ball touches the ground (foot up) | 19.20 | yes | — | Rename: Foot up |
| Hooker of the feeding team fails to strike | 19.22 | yes | — | Exclude. Will just be counted as a reset |
| Front-row player intentionally kicks the ball out | 19.23 | yes | — | Rename: Other |
| Bringing the ball back into the scrum after it has left | 19.38d | yes | — | Rename Other |
| Non-front-row player playing the ball in the tunnel | 19.38e | yes | — | Rename Illegal scrumming |
| Scrum-half dummying that the ball is out | 19.38f | yes | — | Rename; other |

### Penalty

| Infringement | Law | Player? | Today | Comments |
| --- | --- | --- | --- | --- |
| Incorrect front-row or back-row composition ⚠ | 19.5 | no | — |  |
| Props not bound to the hooker | 19.7a | no | — | Rename: Illegal Binding |
| Hooker binding incorrectly | 19.7b | yes | — | Rename: Illegal Binding |
| Locks not bound to the props and each other | 19.7c | no | — | Rename: Illegal Binding |
| Back row bound without an arm on a lock | 19.7d | yes | — | Rename: Illegal Binding |
| Loosehead / tighthead binding arm incorrect | 19.11a–b | yes | — | Rename: Illegal Binding |
| Gripping the opponent's jersey illegally | 19.11c | yes | — | Rename Illegal Binding |
| Binding not maintained through the scrum | 19.11d | yes | — | Rename: Illegal Binding |
| Pushing not straight (boring / angling in) | 19.19 | yes | — | Rename: Illegal Scrumming |
| Striking with both feet | 19.21 | yes | — | Rename: Other |
| Lifting the ball, or playing it above the lower legs | 19.24 | yes | — | Rename; Other |
| Moving forward before the scrum is over | 19.27 | yes | `offside` |  |
| Receiving scrum-half in the wrong starting position | 19.28a–b | yes | — | Rename: Other |
| Defending scrum-half offside at the scrum | 19.30a–c | yes | `offside` |  |
| Non-participating player inside the 5m offside line | 19.31 | yes | `offside` |  |
| Offside line breach near the try line | 19.32 | yes | `offside` |  |
| Front row charging on engagement | 19.37a, 9.19a | no | — | Rename: Other |
| Pulling an opponent | 19.37b, 9.19b | yes | — | Rename: Illegal Scrumming |
| Lifting or forcing an opponent upwards | 19.37c, 9.19c | yes | — | Rename: Illegal Scrumming |
| Intentionally collapsing the scrum | 19.37d, 9.19d | yes | `collapsing_scrum` | Rename: Collapsing scrum |
| Intentionally falling or kneeling | 19.37e | yes | — | Rename: Collapsing Scrum |
| Falling on the ball as it emerges | 19.38a | yes | — | Rename: Other |
| Scrum-half kicking the ball inside the scrum | 19.38b | yes | — | Rename: Other |
| Non-front-row player holding or pushing an opponent | 19.38c | yes | — | Rename: Other |

### Scrum

| Infringement | Law | Player? | Today | Comments |
| --- | --- | --- | --- | --- |
| Ball not played out after the "use it" call | 19.26 | no | `unplayable` | Exclude from template. Will just be counted as scrum reset. |

## 1.5 Touch, quick throw and lineout

| Infringement | Law | Sanction | Player? | Today | Comments |
| --- | --- | --- | --- | --- | --- |
| Carrying the ball into touch and not releasing it | 18.3 | Penalty | yes | — | Rename:  Other |
| Quick throw taken incorrectly (wrong mark, not straight, short of 5m, feet in the field) | 18.4a–d | **Choice** — lineout or scrum | yes | — | Each of the reasons you mention here can be a reason for a lineout. I forgot that line outs can also be caused by other lineout infringements. So we can have a reason for a lineout. Another reason for lineout is just: Out |
| Quick throw attempted after the lineout has formed, or with a touched/different ball | 18.5a–c | Lineout to the same team | yes | — | Exclude from template |
| Ball fails to reach 5m, or is prevented from doing so | 18.6, 18.25 | **Free kick** | yes | — | Rename: Not 5m |
| Closing the gap before the throw | 18.10 | **Free kick** | no | `closing_gap` | Rename: Closing the Gap |
| Lineout not formed within 30 seconds | 18.12 | **Free kick** | no | `delaying_lineout` | Rename: Time wasting |
| Non-throwing team has more players than the throwing team | 18.14 | **Free kick** | no | `too_many_players` | Rename: Player Numbers |
| No player between the touchline and the 5m line | 18.15 | **Free kick** | no | — | Rename: Other |
| Receiver position breach | 18.16 | **Free kick** | no | — | Rename: Other |
| Leaving the lineout illegally | 18.17a–b | **Free kick** | yes | — | Rename: Other |
| Pre-gripping a jumper | 18.19 | **Free kick** | yes | — | Rename: Early Lineout Jump |
| Lifting or jumping before the ball leaves the hands | 18.20 | **Free kick** | yes | `early_lift` | Rename: Early Lineout Jump |
| Contact with an opponent before the ball is thrown | 18.21 | Penalty | yes | — | Rename: Contact |
| Thrower steps into the field, or feet off the touchline | 18.22 | **Choice** — lineout or scrum | yes | — | Rename; Other |
| Throw not straight | 18.23a | **Choice** (Global Law Trial — an uncontested throw is no longer sanctioned) | yes | `not_straight`, an **outcome** rather than a reason | I think we should keep it as a reason for the next event (scrum or lineout). The only outcome for a lineout is won or lost |
| Throw fails to reach 5m before hitting the ground | 18.23b | **Choice** — lineout or scrum | yes | — | Rename: Short Lineout Throw |
| Throw not made without delay | 18.23c | **Free kick** | yes | — | Rename: Wasting time |
| Dummy throw | 18.24 | **Free kick** | yes | `faking_throw` | Rename: Faking Lineout throw |
| Thrower or opposite number moves out of position | 18.28 | Penalty | yes | — |  |
| Catching or deflecting with the outside arm | 18.29b | **Free kick** | yes | — | Rename: Skew Lineout Throw |
| Failing to lower a lifted team-mate safely | 18.29c, 9.26 | **Free kick** | yes | — | Rename: Dangerous Jump |
| Leaving the lineout beyond the 10m mark, or not continuing to move | 18.29d | **Free kick** | yes | — |  |
| Grasping an opponent in the air, or once a maul has formed | 18.29e | Penalty | yes | — | Rename: Infringing Jumper |
| Jumper crosses the mark of touch and does not return | 18.31 | Penalty | yes | — |  |
| Non-participant crosses the offside line | 18.36 | Penalty | yes | — |  |
| Leaving the lineout before it ends | 18.37 | Penalty | yes | — | Rename: Leaving lineout early |

Every penalty in this table is currently collapsed into the single `lineout_foul` reason on
`penalty_awarded`.

## 1.6 Kick-off and restarts

| Infringement | Law | Sanction | Player? | Today | Comments |
| --- | --- | --- | --- | --- | --- |
| Not a drop kick | 12.1 | **Choice** — retake or scrum | yes | — | Rename: Not a drop |
| Kick taken from the wrong place | 12.2 | **Choice** — retake or scrum | yes | — | Rename: Wrong place |
| Kicker's team in front of the ball | 12.5a | **Choice** — retake or scrum | yes | — | Rename: In front of ball |
| Opposition in front of the 10m line | 12.5b | Retake | yes | — | Rename:: Other |
| Ball does not reach the 10m line | 12.6 | **Choice** — retake or scrum | yes | `too_short` |  |
| Ball directly into touch | 12.8 | **Choice** — retake / scrum / lineout / quick throw | yes | `directly_out` |  |
| Ball into the opponents' in-goal and made dead | 12.9 | **Choice** — retake or scrum | yes | `long` |  |
| Ball into own in-goal and made dead | 12.10 | 5m scrum to the non-kicking team | yes | — |  |
| Drop-out delayed | 12.13b | **Free kick** | yes | — | Rename: Wasting time |
| Drop-out does not cross the sanction line | 12.13c | **Choice** — retake or scrum | yes | `too_short` |  |
| Drop-out directly into touch | 12.13d | **Choice** — retake / scrum / lineout / quick throw | yes | `directly_out` |  |
| Opponent advances before a drop-out | 12.14 | **Free kick** | no | — |  |
| Opponent delays or obstructs a drop-out | 12.15 | Penalty | yes | — | Rename: Wasting time |
| Drop-out into the opponents' in-goal and made dead | 12.18 | **Choice** — retake or scrum | yes | — | REname: Too long |
| Drop-out kicker's team in front of the ball | 12.19 | **Scrum** | yes | — |  |

`kickoff`, `dropout_22m` and `dropout_goalline` already model these as **outcomes** rather than
reasons, which is the right shape — they are results of a kick, not infringements recorded against a
team. The gap here is coverage, not structure.

## 1.7 Open play

| Infringement | Law | Sanction | Player? | Today | Comments |
| --- | --- | --- | --- | --- | --- |
| Knock-on | 11.1–11.2 | **Scrum** | yes | `knock_on` |  |
| Forward pass | 11.6 | **Scrum** | yes | `forward_pass` |  |
| Intentional knock forward | 11.3 | Penalty | yes | — | Rename: Knock Down |
| Intentional throw forward | 11.7 | Penalty | yes | — | Rename Other |
| Offside — interfering, or not retreating | 10.4a–b | Penalty, or scrum where the team last played it | yes | `offside` |  |
| Offside after a kick — the 10-metre law | 10.4c | Penalty, or scrum | yes | `offside` |  |
| Accidental offside | 10.5 | **Scrum** | yes | `accidental_offside` |  |
| Charging or pushing other than shoulder-to-shoulder | 9.1 | Penalty | yes | `obstruction` |  |
| Offside player intentionally obstructing | 9.2 | Penalty | yes | `obstruction` |  |
| Preventing an opponent tackling the ball-carrier | 9.3 | Penalty | yes | `obstruction` |  |
| Preventing an opponent playing the ball | 9.4 | Penalty | yes | `obstruction` |  |
| Ball-carrier running into an offside team-mate | 9.5 | Penalty | yes | `obstruction` | Rename Accidental Offside |
| Obstruction while the ball is dead | 9.6 | Penalty | yes | — | Rename: Other |
| Intentionally infringing any law | 9.7a | Penalty | yes | `professional_foul` |  |
| Handling the ball out of the playing area | 9.7b | Penalty | yes | — | Rename: Other |
| Simulation — leading officials to think an opponent infringed | 9.7c | Penalty | yes | — | Rename: Other |
| Wasting time | 9.7d | **Free kick** | yes | `wasting_time` |  |
| Team repeatedly committing the same offence | 9.8, 9.10 | Penalty, plus a card after a warning | no | `repeated_infringements`, cards only | Rename Repeated offense (reason for yellow card) |
| Player repeatedly infringing | 9.9 | Penalty, plus a card | yes | `repeated_infringements`, cards only | Exclude from template. |
| Attempting to kick the ball out of an opponent's hands | 9.23 | Penalty | yes | — | Rename: Other |
| Dissent, or not stopping at the whistle | 9.28 | Penalty | yes | — | Rename: Other |
| Unsportsmanlike conduct | 9.27 | Penalty | yes | — | Rename: Other |
| Mark called correctly | 17 | **Free kick** | yes | `mark` | Rename: Mark |

## 1.8 In-goal

| Situation | Law | Sanction | Today | Comments |
| --- | --- | --- | --- | --- |
| Ball held up in-goal | 21.16 | 5m scrum, or a try-line drop-out depending on how the ball entered | `held_up` | Rename: Held up |
| Defending team takes the ball into their own in-goal and makes it dead | 21.4 | 5m scrum to the attacking team | — | Rename: Carried Back |
| Attacking team plays the ball into in-goal and it is made dead | 21.4 | **Try-line drop-out** (changed from a 22m drop-out, July 2026) | `dropout_goalline` | Rename: Dead Ball |
| Unsuccessful kick at goal or drop goal made dead in-goal | 21.11 | **22m drop-out** | `dropout_22m` | Not needed to include in template. |
| Ball kicked through the in-goal into touch-in-goal or dead | 21.11 | Defending team's choice — 22m drop-out or scrum | — | Rename: Dead Ball |
| Doubt about which team grounded first | 21.17 | 5m scrum to the attacking team | — | Rename: Held up |
| Ball-carrier grounds the ball while touching the touchline | 21.5 | Lineout to the opposition | — | Exclude from template. WIll just result in a lineout. Lineouts dont need a reason. |
| Reaching out to ground the ball after being tackled short | 21.8 | Penalty | — | Rename: Double movement |
| Kicking the ball from a player reaching out to ground it | 21.10 | Penalty | — | Rename: Other |
| Foul play preventing a probable try | Law 8, via Law 9 | **Penalty try** — 7 points, no conversion — plus a card | `penalty_try` | Rename: Foul Play |

## 1.9 Administering a penalty or free kick

Offences committed *after* the whistle, while the sanction is being taken. They matter because they
change what the non-offending team ends up with, and because the 10m advance is a common in-match
event we cannot record at all today.

| Infringement | Law | Sanction | Player? | Today | Comments |
| --- | --- | --- | --- | --- | --- |
| Not taking the kick without delay | 20.5 | **Scrum** to the opposition | yes | — | Rename: Other |
| Using the wrong ball | 20.7 | **Scrum** | yes | — | Rename: Other |
| Kicker's team in front of the ball | 20.10 | **Scrum** | yes | — | Rename: Offside |
| Ball not kicked a visible distance | 20.11 | **Scrum** | yes | — |  |
| Opposition not retreating 10m, or delaying the kick | 20.12–20.15 | **A second penalty, 10m forward** | yes | — | Rename: Not 10m back |
| Charging a free kick fairly and preventing it | 20.16–20.17 | **Scrum** to the charging team | no | — | Rename: Other |

What a team may elect, which is what our outcome lists model:

- **From a penalty** — kick at goal, kick to touch and retain the throw, tap and go, or a scrum.
- **From a free kick** — tap and go, kick to touch (no ground gained unless behind their own 22),
  or a scrum. **No kick at goal**, and no drop goal until a ruck, maul, scrum or lineout has
  followed.

`free_kick`'s current outcomes — `scrum`, `line_kick`, `tap_go` — are therefore correct; a
`line_kick` from a free kick simply does not gain ground.

## 1.10 Foul play and cards

A card never stands alone: it always accompanies a penalty or a penalty try. The lists below are a
*subset* of the penalty offences above, escalated.

### Always at least a yellow card
- Deliberately preventing a probable try — professional or cynical foul (9.7a)
- Repeated team infringement after a general warning (9.10)
- Any offence for which a penalty try is awarded (Law 8)

### Head Contact Process — yellow, or red where both the contact and the danger are high
- High tackle / head contact (9.13, 14.5a)
- Reckless or dangerous play, leading with the elbow or forearm (9.11)
- Tackling a player in the air (9.17)
- Tip tackle / lifting and dropping a player (9.18)
- Contact above the shoulder line at a ruck or maul (9.20b)
- Charging into a ruck or maul without binding (9.20a)
- Croc roll (9.20d)
- Dropping weight onto a player, or targeting the lower limbs (9.20e)

### Red card
- Punching, striking, biting, eye contact (9.12)
- Stamping, trampling, tripping, kicking (9.12)
- Retaliation (9.21)
- A second yellow card (9.29)
- Any Head Contact Process offence at the top of the scale

### 20-minute red card
Full law from 1 July 2026 for elite rugby: the offender is permanently sent off and the team may
replace them after 20 minutes. It applies to offences that are **neither intentional nor highly
dangerous** — a deliberate punch stays a full red, while a mistimed high tackle with head contact is
the typical 20-minute case. `defaultSettings.allowTimedRedCard` is `false` in the seed, so it is off
unless a competition enables it.

---

# Part 2 — The same lists, by sanction

A rollup of Part 1, which is the view that maps directly onto a template's `reasons`.

## 2.1 Penalty (`penalty_awarded`)

| Phase | Infringements | Comments |
| --- | --- | --- |
| **Tackle** | High tackle / head contact · not releasing the ball-carrier · not rolling away · off feet · preventing release · tackled player not releasing · not moving away · sealing off · arriving off feet · side entry · playing the ball on the ground · croc roll · offside · not playing the ball immediately · going to ground uncontested · late tackle · early tackle · dangerous tackle · tackling a player without the ball · no-arms tackle · tackling a player in the air · tip tackle · charging the kicker · excessive hand-off · flying wedge |  |
| **Ruck** | Side entry · joining off feet · joining in front of the hindmost player · joining without binding · not retiring · hands in the ruck · off feet · playing the ball unbound · picking up with the legs · collapsing the ruck · stepping on a player · falling over the ball · kicking the ball out · preventing the ball being played away · contact above the shoulder line · dropping weight on a player |  |
| **Maul** | Illegal rip · joining offside · leaving without retiring · joining ahead of the hindmost player · joining without binding · going to ground · truck-and-trailer · collapsing the maul · pulling a player out · rejoining unbound · interfering with the ball being played |  |
| **Scrum** | Front-row and back-row composition · binding offences (props, hooker, locks, back row, loosehead, tighthead, jersey grip, binding not maintained) · boring / angling in · striking with both feet · lifting or handling the ball · early break · scrum-half positioning · offside lines · charging on engagement · pulling an opponent · lifting an opponent · collapsing the scrum · falling or kneeling · falling on the emerging ball · scrum-half kicking the ball in the scrum · holding or pushing by a non-front-row player |  |
| **Lineout** | Not releasing the ball into touch · contact before the throw · thrower out of position · grasping a player in the air or in a maul · jumper crossing the mark · non-participant crossing the offside line · leaving the lineout before it ends |  |
| **Restart** | Delaying or obstructing a drop-out |  |
| **In-goal** | Reaching out after being tackled short · kicking the ball from a player grounding it |  |
| **Open play** | Intentional knock forward · intentional forward pass · offside · obstruction (five distinct clauses) · obstruction with the ball dead · intentional infringement · handling the ball out of play · simulation · repeated infringement · kicking the ball from an opponent's hands · dissent · unsportsmanlike conduct |  |
| **Technical** | Opposition not back 10m — a further penalty, advanced 10m |  |

## 2.2 Free kick (`free_kick`)

| Phase | Infringements | Comments |
| --- | --- | --- |
| **Scrum** | Not ready in 30s · head or shoulders below hips · head position · brake foot (set, adjusted, not removed) · not ready to push · foot position · feed from the wrong side · feed from inside the tunnel · delaying the feed · feed not a single quick movement · feed not straight · first contact outside the tunnel · early push · foot up · hooker not striking · kicking the ball out of the scrum · returning the ball into the scrum · non-front-row player in the tunnel · scrum-half dummying the ball out |  |
| **Lineout** | Ball not reaching 5m or being blocked · closing the gap · not formed in 30s · too many players · no player in the 5m channel · receiver breach · leaving the lineout · pre-gripping · early lift · throw delayed · dummy throw · outside-arm catch · not lowering a jumper safely · leaving beyond the 10m mark |  |
| **Ruck** | Head and shoulders below hips · returning the ball into the ruck · falsely indicating the ruck has ended |  |
| **Maul** | Head and shoulders below hips when joining · falsely indicating the maul has ended |  |
| **Restart** | Drop-out delayed · opponent advancing before a drop-out |  |
| **Open play** | Wasting time · a mark |  |

## 2.3 Scrum (`scrum` reasons)

Two distinct kinds of cause, which is worth keeping visible in the UI grouping:

**Awarded for an infringement**
- Knock-on · forward pass · accidental offside · offside where the referee elects a scrum
- Ball unplayable at a ruck · at a maul · at a scrum after "use it"
- Maul collapses, is stationary, or the ball-carrier goes to ground
- Held up in-goal · defender makes the ball dead in their own in-goal · doubt over the grounding
- Kick-off or drop-out taken illegally, when the receiving team elects a scrum
- A penalty or free kick taken illegally (delay, wrong ball, team in front, no visible distance)
- A free kick fairly charged down

**Elected by the non-offending team**
- From a penalty (`penalty_scrum` today) · from a free kick (`free_kick` today)

## 2.4 Lineout

The `lineout` template has **no** `reasons` at all today — only won / lost / not straight. The
causes that put a lineout on the field are:

- Ball kicked into touch · carried into touch · a player carrying it into touch
- A penalty kicked to touch — the kicking team retains the throw
- A free kick kicked to touch — the throw goes to the opposition
- A quick throw taken illegally, where the non-offending team elects a lineout
- A kick-off or drop-out directly into touch, where the receiving team elects a lineout
- A ball-carrier grounding the ball while touching the touchline in-goal

## 2.5 Cards

See 1.10. The important structural point is that every card offence in this list is also a penalty
offence, so the card lists and `penalty_awarded`'s list overlap by construction rather than by
accident.

---

# Part 3 — Gaps against the current seed

Measured against
[rugby.seed.ts](file:///c:/Fred/Coding/SK/server/src/scripts/setup/seeds/sports/rugby.seed.ts).

## 3.1 The maul is missing entirely

There is no maul reason group on `penalty_awarded` or `free_kick`, no `maul` template, and no maul
cause on `scrum`. Collapsing a maul, truck-and-trailer and pulling a player out of a maul are all
common, and today the only place to put them is `other`. This is the single biggest hole.

## 3.2 `scrum_other` and `lineout_foul` are hiding two whole laws

`penalty_awarded` offers three set-piece reasons — `collapsing_scrum`, `scrum_other`, `lineout_foul`
— against roughly 24 scrum penalties and 7 lineout penalties in the laws. Every binding offence,
boring, charging, and every lineout offside offence funnels into two catch-alls, so the data cannot
answer "what are we being penalised for at scrum time", which is exactly the question a coach asks.

## 3.3 Tackle penalties are thin, and the dangerous ones live on the wrong template

`high_tackle` and `tip_tackle` exist only on `yellow_card` / `red_card`, but the sanction for both is
a penalty first and a card second. A high tackle that draws only a penalty cannot be recorded as one.
Also absent: no-arms tackle, tackling a player in the air, tackling a player without the ball, croc
roll, charging the kicker, and — notably — plain **not releasing the ball-carrier** by the tackler,
which is distinct from the tackled player's `not_releasing`.

## 3.4 `off_feet` and `side_entry` are doing double duty

Both appear once, under the "Ruck" group, but each also covers a tackle offence (14.8a–c) and
`off_feet` covers a tackler offence (14.5d). Either the group name should widen to "Tackle / Ruck",
or the options should be duplicated per phase. Duplication costs ids; widening costs precision.

## 3.5 Free-kick scrum reasons overlap

`early_push` (19.17, pushing before the ball is in) and `pre_engagement` (19.12b, not ready to push)
are different offences but read almost identically to a scorer under time pressure. `pre_engagement`
is also an odd name for "not in position and ready to push". Candidates for a rename or a merge.

## 3.6 `kicking_ball_away` is probably on the wrong template

It sits under `free_kick` → General. Kicking the ball away after the whistle is normally penalised as
a further penalty (10m advance, 20.12–20.15) or as unsportsmanlike conduct (9.27) — both penalties.
Kicking the ball out of a ruck is 15.16e, also a penalty. There may be a community-rugby convention
behind the current placement; if not, it should move.

## 3.7 `not_straight` is an outcome on `lineout` but a free kick in law

`lineout` has an outcome `not_straight` with no points and no trigger. Under the Global Law Trial an
uncontested not-straight throw is no longer sanctioned at all, and a contested one gives the
non-throwing team a choice of lineout or scrum. So the current single outcome models neither the old
law nor the new one. Decide whether it stays a lineout outcome, becomes a `free_kick` reason, or is
removed.

## 3.8 The `scrum` reason list is missing most of its causes

Present: `knock_on`, `forward_pass`, `held_up`, `unplayable`, `accidental_offside`, `penalty_scrum`,
`free_kick`. Missing: maul unsuccessful, ball unplayable at a ruck as distinct from a maul, restart
offences elected as a scrum, penalty/free-kick administration offences, a charged-down free kick,
doubt over the grounding, and a defender making the ball dead in their own in-goal (which `held_up`
is currently being stretched to cover).

## 3.9 `lineout` has no reasons at all

Per `SCORE-11`'s own note — "every event that can *award* a scrum or lineout needs a matching reason
on the child" — a lineout is awarded by at least six distinct causes and records none of them. Note
that `penalty_awarded` → `line_kick` currently triggers the `line_kick` template (did the kick find
touch), not a `lineout`, so the chain stops before the lineout is created. Whether it should continue
is decision D4.

## 3.10 `penalty_scrum` is an implementation artefact

Flagged in `SCORE-11` already. Its `name` is "Penalty" and its id is `penalty_scrum` purely because
`penalty` was taken conceptually. Renaming it is a data migration — see decision D6.

## 3.11 Card lists duplicate penalty reasons with different wording

`yellow_card` has `high_tackle`, `dangerous_play`, `professional_foul`, `cynical_foul`,
`repeated_infringements`, `offside`, `other`. `penalty_awarded` separately has `dangerous_tackle`,
`professional_foul`, `offside`. The same offence is therefore named two different ways depending on
whether a card came out, and `professional_foul` / `cynical_foul` on the card list are the same thing.

## 3.12 `red_card` mixes sanctions with offences

`second_yellow` is not an offence, it is a consequence — and it is the one red card that can never be
a 20-minute red. `timed_red_card` currently offers only `dangerous_high_tackle`, `tip_tackle` and
`other`, while the law's 20-minute criterion is "not intentional and not highly dangerous", which
applies to a much wider set.

---

# Part 4 — Decisions, and what they settled

All seven were answered on 2026-08-18. The questions are kept in full because Parts 5 and 6 are
downstream of the answers, and because the reasoning matters more than the verdict if any of this is
revisited.

**D1 — Are cards their own event, or an escalation of a penalty? → Their own event, with their own
reasons.** A card is recorded as a separate event, never as a linked child of a penalty. The two
lists overlap in places — a high tackle is a penalty reason and a card reason — and that overlap is
accepted rather than engineered away, because the lists are not the same list: a card can be shown
for repeated infringement, which is not a penalty reason at all, and a penalty can be given for
offences no card ever follows. So gap 3.11 closes by *deciding* the duplication is real rather than
accidental. What still gets cleaned up is the wording — the same offence must not be called
`dangerous_tackle` on one template and `high_tackle` on another — and `professional_foul` /
`cynical_foul`, which are two names for one thing. The card lists are drafted in 6.5.

**D2 — How long should a reason list be? → Split by phase, and make the phase the scorer's first
choice.** Not just for display: picking "Scrum" and then choosing from five options is faster and
more accurate under match pressure than scanning forty. The scorer already knows the phase — they
watched it happen — so the first tap is free information. The screen design this implies is 4.1.

**D3 — Grouped by phase or by sanction? → Phase, consistently across every template.** One vocabulary
— Tackle · Ruck · Maul · Scrum · Lineout · Restart · In-goal · Open Play · Technical — used by
`penalty_awarded` and `free_kick` alike, with a template showing only the groups it has entries for.
This makes the two lists comparable and means a scorer learns one layout, not two.

**D4 — Should `line_kick` chain into a `lineout`? → No. `line_kick` chains into nothing.** If the
kick finds touch the scorer records a `lineout` event themselves, with reason `penalty` or
`free_kick`; if it does not, play simply continues and there is nothing to record. The chain stays
two deep. Note this does *not* make the lineout's new reason list redundant — it makes it load
bearing, since the reason is now chosen by hand rather than prefilled.

**D5 — Do we record the "choice" sanctions? → No.** The election is visible in what happens next: if
the team took a scrum, a scrum event follows. Recording the choice as well would state the same fact
twice and let the two disagree.

**D6 — Migration policy for renamed ids. → There is nothing to migrate. Finalise the ids now.**
There are no meaningful stored `game_events`; what exists can be reset. So this is the one moment
where an id costs nothing to change, and Part 6 uses it: every reason gets its final id, including
the phase prefixes that let one offence exist per phase (`tackle_offside`, `ruck_offside`,
`scrum_offside`) and the `penalty_scrum` → `penalty` rename that closes gap 3.10. **After the seed
edit lands, D6 reverts to its original meaning** — a stored id is a contract and renaming one costs
a migration again. The nine-row migration table that used to sit in 5.11 is gone with this decision.

**D7 — Which reasons carry `specifyPlayer: false`? → None, for now. The safe default is `true`.**
Player selection stays enabled everywhere; where an individual is not at fault the scorer simply
does not pick one. A pass over the settled list will turn it off where it is genuinely
inapplicable — a collapsed scrum, a lineout with too many players. Until then the **Player?** column
in Part 1 is advisory, not the spec.

## 4.1 Reason selection on mobile — the proposed screen

D2 asks for a shape, so here is one. It needs no schema change: `reasons` is already
`[{ name, options }]`, which is exactly a phase and its offences.

**Two levels on one screen, not two screens.** The reason step opens on a grid of phase tiles.
Tapping one swaps the grid for that phase's options, with a back chip in the header. It is the same
step in the dialog's step bar — no extra tab, no navigation stack.

```
  ┌──────────────────────────────────┐        ┌──────────────────────────────────┐
  │ SELECT INFRINGEMENT              │        │ ‹ ALL PHASES        SCRUM        │
  │                                  │        │                                  │
  │  ┌────────┐┌────────┐┌────────┐  │        │  ┌────────────────────────────┐  │
  │  │ TACKLE ││  RUCK  ││ SCRUM  │  │        │  │ Illegal binding            │  │
  │  │   13   ││   7    ││   5    │  │        │  ├────────────────────────────┤  │
  │  └────────┘└────────┘└────────┘  │  tap   │  │ Illegal scrumming          │  │
  │  ┌────────┐┌────────┐┌────────┐  │  ───►  │  ├────────────────────────────┤  │
  │  │LINEOUT ││  MAUL  ││  OPEN  │  │        │  │ Collapsing scrum           │  │
  │  │   4    ││   5    ││   5    │  │        │  ├────────────────────────────┤  │
  │  └────────┘└────────┘└────────┘  │        │  │ Offside                    │  │
  │  ┌────────┐┌────────┐┌────────┐  │        │  ├────────────────────────────┤  │
  │  │RESTART ││ IN-GOAL││ ADMIN  │  │        │  │ Other                      │  │
  │  │   1    ││   2    ││   1    │  │        │  └────────────────────────────┘  │
  │  └────────┘└────────┘└────────┘  │        │                                  │
  └──────────────────────────────────┘        └──────────────────────────────────┘
```

Why this and not the alternatives:

- **Nine tiles fit one phone screen with no scrolling.** Three columns of three, each tile a large
  thumb target with the phase name and its option count. The count is not decoration — it tells the
  scorer whether they are about to see 13 options or 1.
- **The second level is at most 13 rows**, and full-width rows beat wrapped chips here: a chip grid
  makes every option a different size and a different distance from the thumb, which is exactly what
  goes wrong when someone is looking at the field rather than the phone.
- **An accordion was the obvious alternative and is worse.** Expanding a group in place keeps the
  other eight headers on screen, so the list still scrolls, and the thing the scorer wants — a short
  list — is never actually short.
- **Phase tiles are ordered by how often they occur**, not alphabetically: Tackle, Ruck, Scrum,
  Lineout, Maul, Open Play, Restart, In-goal, Technical.
- **Editing an event opens level two directly**, on the stored reason's phase, with it selected.
  Since ids are phase-prefixed (D6), the phase is recoverable from the id alone even if the grouping
  is later rearranged.
- **The step bar already has somewhere to show the answer.** `SCORE-10` gave each tab a sublabel, so
  the reason step can read "Scrum · Illegal binding" — phase and offence, without opening it.

Two implementation notes for whoever builds it:

- It is a change to `DynamicScoringDialog`'s `REASON_SELECTION` case only, and it should stay generic:
  fall back to today's flat chip list when a template has one group, or few enough options to fit
  without drilling. Rugby's `scrum` and card templates would keep the flat list under that rule;
  `penalty_awarded` and `free_kick` would get the grid.
- Worth considering later, not now: a "recent" row of the last two or three reasons picked in this
  match. Repeated infringement is repeated by definition, and it would collapse the common case to
  one tap.

---

# Part 5 — The consolidated reason lists

The answer to D2, being built phase by phase from the Comments column in Part 1.

**The principle, set 2026-08-18:** the UI does not need one reason per law. Part 1 is the *law* —
exhaustive, so nothing is missed. Part 5 is the *picker* — as short as a scorer can work with under
match pressure, with several law infringements collapsing onto one reason wherever the distinction
would not change how anyone reads the match afterwards.

**Progress:** all ten phases have a list. 5.1 (tackle) came out of the first comment round; 5.2 to
5.10 were written from the second, and each ends with the queries that round raised. 5.11 rolls them
up per template.

**Read Part 6 for the ids.** Part 5 is the reasoning — which law lands on which reason, and what was
argued about on the way. **Part 6 is the spec**, written after D6 freed us to choose ids, and it
supersedes every `Seed id` in the tables below: each reason is now prefixed with its phase, so
`offside` at a tackle, a ruck, a maul and a scrum are four ids rather than one shared one. That
answers, in one stroke, the shared-id question raised in 5.2 point 1, 5.3 point 2, 5.4 point 1 and
5.6 point 2 — **one id per phase, always** — and gap 3.4 with it.

## 5.1 Tackle — penalty reasons

25 law infringements collapse to **10** reasons — 13 until 2026-08-19, when Off feet, Side entry
and Croc roll were dropped from the tackle; see the note under the table.

| Reason | Law infringements it covers | Seed id | Status |
| --- | --- | --- | --- |
| Dangerous tackle | Head/neck contact (14.5a, 9.13) · dangerous tackle generally (9.13) · no-arms tackle or shoulder charge (9.16) · charging or late-tackling the kicker (9.25) · flying wedge (9.22) | `dangerous_tackle` | Exists |
| Tackle without ball | Late tackle (9.13) · early tackle (9.13) · tackling a player who does not have the ball (9.14) | `tackle_without_ball` | **New — absorbs `late_tackle`, needs a migration** |
| Tackle in the air | Tackling a player whose feet are off the ground (9.17) | `tackle_in_air` | New |
| Tip Tackle | Lifting and dropping a player (9.18) | `tip_tackle` | New on `penalty_awarded`; the id already exists on `red_card` / `timed_red_card` |
| Tackler not releasing | Tackler does not release the ball-carrier (14.5b) · tackler prevents the tackled player releasing or playing it (14.5e–f) | `tackler_not_releasing` | New |
| Tackler not rolling away | Tackler does not roll or move away (14.5c) | `not_rolling` | Exists — display rename only |
| Not releasing the ball | Tackled player does not release or make it available (14.7a) · does not move away (14.7b) · lies on or over the ball (14.7c) | `not_releasing` | Exists — display rename only |
| Playing on the ground | Tackler plays the ball off their feet (14.5d) · any player plays it while on the ground (14.8d) | `playing_on_ground` | New — see the merge note below |
| Offside | Offside at the tackle (14.8f) | `offside` | Exists |
| Other | Player on their feet does not play it immediately (14.9a) · going to ground uncontested (14.9b) · excessive hand-off (9.24) | `other` | Exists |

**Off feet, Side entry and Croc roll were removed on 2026-08-19.** All three are offences by a player
*arriving* at the tackle (14.8a–b, 14.8c, 14.8e) rather than by the two players in it, and a scorer
watching an arriving player is watching a ruck form. They move to the ruck group — 14.8a–b into
`ruck_off_feet`, 14.8c into `ruck_illegal_entry`, 14.8e into `ruck_dangerous_play` — which gives the
tackle list a clean rule: **the tackle is the tackler and the tackled player; everyone arriving is
the ruck.** `croc_roll` survives as a *card* reason, where it names the offence directly.

Two rows in the table are the same kind of arriving-player offence and were **not** removed: Playing
on the ground (14.8d, though it also covers the tackler's 14.5d) and Offside (14.8f). Worth
confirming they should not follow the other three to the ruck.

### Points to settle before this is written into the seed

1. **Two near-identical names were merged — confirm.** The comments gave "Ball played on ground" for
   14.5d and "Playing on the ground" for 14.8d; both are folded into **Playing on the ground**, since
   a scorer picking between them would be guessing. Likewise 14.7c was written "Not releasing" while
   14.7a–b were "Not releasing the ball" — all three are folded into **Not releasing the ball**. Both
   merges are reversible if the distinction was intended.

2. **~~`off_feet` quietly changes meaning.~~** Moot from 2026-08-19: there is no tackle `off_feet`
   at all, and D6 removed the migration question. Kept for the record — it covered 14.5d today
   (the tackler playing the ball off their feet), while under this list 14.5d becomes "Playing on
   the ground". Stored `off_feet` events could have meant either — a
   migration question of the same kind as D6, but a *semantic* one rather than a rename, so it is
   easier to miss.

3. **~~`late_tackle` disappears.~~** Settled by D6 — no migration, the id is simply chosen. The
   offence is `tackle_no_ball` in Part 6.

4. **Head contact and the card templates.** The comment on 14.5a — "should be added to penalty as
   well" — is already satisfied on `penalty_awarded`, which has `dangerous_tackle`. What it exposes
   is the *other* half: `yellow_card` separately carries `high_tackle` for the same offence under a
   different name. That is gap 3.11, and D1 decides whether it survives at all.

5. **~~Four reasons are shared with the ruck.~~** Settled twice over: D6 gives every phase its own
   id, and the 2026-08-19 change moved three of the four to the ruck outright. Only `offside` is
   still an offence in both phases, as `tackle_offside` and `ruck_offside`.

## 5.2 Ruck

18 law infringements collapse to **7** penalty reasons, **1** free-kick reason and the scrum cause
that already exists — plus the three arriving-player offences the tackle handed over on 2026-08-19
(14.8a–b, 14.8c, 14.8e), which need no new reasons.

### Penalty

| Reason | Law infringements it covers | Seed id | Status |
| --- | --- | --- | --- |
| Illegal entry | Joining off feet or from in front of the offside line (15.5) · joining in front of the hindmost player (15.6) · joining without binding (15.7, 9.20a) · **arriving player enters from the side at a tackle (14.8c)** | `ruck_illegal_entry` | New |
| Offside | Not joining and not retiring (15.8–15.9) · preventing an opponent playing the ball away (15.18) | `offside` | Exists |
| Hands in ruck | Handling the ball in the ruck (15.11) | `hands_in_ruck` | Exists |
| Off feet | Failing to stay on feet in the ruck (15.12) · **arriving player off their feet at a tackle (14.8a–b)** | `ruck_off_feet` | Exists |
| Collapsing | Intentionally collapsing the ruck or jumping on it (15.16b, 9.20c) | `collapsing` | New |
| Dangerous play | Stepping on a player (15.16c) · contact above the shoulder line (9.20b) · dropping weight onto a player or targeting the lower limbs (9.20e) · **croc roll (14.8e, 9.20d)** | `ruck_dangerous_play` | New |
| Other | Playing the ball alongside rather than bound in (15.13) · picking the ball up with the legs (15.16a) · falling on or over the emerging ball (15.16d) · kicking the ball out of the ruck (15.16e) | `other` | Exists |

### Free kick

| Reason | Law infringements it covers | Seed id | Status |
| --- | --- | --- | --- |
| Other | Head and shoulders below hips (15.3) · returning the ball into the ruck (15.16f) · falsely indicating the ruck has ended (15.16g) | `other` | Exists — the ruck contributes no *named* free-kick reason |

### Scrum

Ball unplayable in the ruck (15.20) becomes `ruck_unplayable`. It drew no comment and needs no
change beyond the phase prefix; the maul's equivalent is `maul_unplayable` (5.3), so the two read as
a pair rather than sharing one stretched id.

### Points to settle

1. **Gap 3.4 is answered by asymmetry, and that has a cost.** The tackle keeps `side_entry` (14.8c)
   while the ruck's three joining offences merge into `illegal_entry`. So the shared-id question from
   5.1 resolves as "not shared" — but every stored `side_entry` event recorded at a ruck now means
   something the list no longer offers. A D6 migration, and a harder one than `late_tackle` because
   the event does not record which phase it happened in.
2. **`off_feet` narrows, then widens again.** 5.1 took 14.5d off it and "joining off feet" (15.5)
   goes to `ruck_illegal_entry`, leaving only 15.12 — but the 2026-08-19 change hands it 14.8a–b, the
   arriving player at a tackle, which is the same picture on the field.
3. **`dangerous_play` collides with the yellow card.** The same id and the same name already sit on
   `yellow_card`, for the same offences. Whether that is one reason used twice or two reasons that
   happen to match is D1.
4. **~~Croc roll spans both phases.~~** Settled 2026-08-19: it is a ruck offence only, inside
   `ruck_dangerous_play`, and keeps its own name on the card lists where the offence is what is being
   recorded. 9.20a (charging in without binding) sits in `ruck_illegal_entry`.

## 5.3 Maul

16 law infringements collapse to **5** penalty reasons, **2** free-kick reasons and **1** scrum
reason. This closes gap 3.1 — and note it closes it *without* a `maul` template: the maul becomes a
set of reasons on the existing events, not an event of its own.

### Penalty

| Reason | Law infringements it covers | Seed id | Status |
| --- | --- | --- | --- |
| Offside | Joining from an offside position or not retiring (16.5) · leaving the maul without retiring (16.6) | `offside` | Exists |
| Illegal entry | Joining ahead of the hindmost player (16.7a) · joining without binding on the hindmost player (16.7b) · defender rejoining without binding on the frontmost player (16.13) | `illegal_entry` | New — the same id as the ruck's |
| Collapsing | Players other than the ball-carrier going to ground (16.9) · intentionally collapsing or jumping on the maul (16.11a, 9.20c) | `collapsing` | New — the same id as the ruck's |
| Obstruction | Truck-and-trailer (16.10) | `obstruction` | Exists |
| Other | Illegal rip or long-arm transfer (16.2) · pulling or dragging a player out (16.11b) · interfering with an opponent playing the ball (16.18) | `other` | Exists |

### Free kick

| Reason | Law infringements it covers | Seed id | Status |
| --- | --- | --- | --- |
| Illegal entry | Head and shoulders below hips when joining (16.7c) | `illegal_entry` | New on `free_kick` |
| Other | Falsely indicating the maul has ended (16.11c) | `other` | Exists |

### Scrum

| Reason | Law infringements it covers | Seed id | Status |
| --- | --- | --- | --- |
| Ball unplayable | Ball-carrier goes to ground without making the ball available (16.8, 16.17d) · maul unplayable, collapsed or stationary (16.17a–c) · ball not used within 5s of "use it" (16.14, 16.17e) | `maul_unplayable` | New — the ruck's equivalent is `ruck_unplayable`, so the two phases read as a pair |

### Points to settle

1. **Settled 2026-08-19 — it is "Ball unplayable", not "Turnover".** The reason answers *why this
   scrum exists*, and the honest answer at a dead maul is that the ball could not be played, not that
   possession changed — the change of put-in is the consequence, and it is already visible in whose
   scrum it is. So `maul_unplayable` sits beside `ruck_unplayable` and the two breakdown causes read
   as a pair. This also removes the clash with the `turnover` template outright: the earlier plan to
   rename it "Open Play Turnover" is dropped, and it stays "Turnover Won".
2. **`illegal_entry` now spans three lists** — ruck penalty, maul penalty, maul free kick. One id
   reused is the cheaper option and keeps the picker consistent; splitting it per phase costs three
   ids and buys phase-accurate stats. Same argument as point 1 in 5.2, and it should get the same
   answer.

## 5.4 Scrum

39 law infringements collapse to **5** free-kick reasons and **5** penalty reasons. `scrum_other`
disappears, which is most of gap 3.2.

### Free kick

| Reason | Law infringements it covers | Seed id | Status |
| --- | --- | --- | --- |
| Illegal scrumming | Head or shoulders below hips at engagement (19.10a) · head not to the left (19.10b) · brake foot not set or adjusted illegally (19.10c, 19.11e) ⚠ · brake foot not removed on "set" (19.12a) · not in position and ready to push (19.12b) · front-row foot position (19.12c–d) · non-front-row player playing the ball in the tunnel (19.38e) | `illegal_scrumming` | **New — absorbs `pre_engagement`** |
| Illegal feed | Feed from the wrong side (19.15a) · from inside the tunnel (19.15b) · delaying the feed (19.15c) · not a single quick movement (19.15d–e) · not straight (19.15f) | `illegal_feed` | Exists — widens, and **absorbs `delaying_feed`** |
| Foot up | Striking before the ball touches the ground (19.20) | `foot_up` | New |
| Wasting time | Not ready to form the scrum within 30 seconds (19.4) | `wasting_time` | Exists on the General group — the comment said "Time wasting", merged with the lineout's "Wasting time" |
| Other | Ball's first contact outside the tunnel (19.15g) · pushing before the ball leaves the scrum-half's hands (19.17) · front-row player kicking the ball out (19.23) · bringing the ball back into the scrum (19.38d) · scrum-half dummying that the ball is out (19.38f) | `other` | Exists — **absorbs `early_push`** |

**Excluded by the review:** hooker of the feeding team fails to strike (19.22) — recorded as a scrum
reset by the `ScrumResetsCounter`, not as a sanction.

**`early_push` is retired.** 19.17 drew no comment, and rather than leave it as a named reason no
one reviewed it goes to `other` for now — recoverable later if the data shows it is common enough to
deserve its own option. That closes gap 3.5 from both ends: `pre_engagement` is inside
`illegal_scrumming`, `early_push` is inside `other`, and the pair that read alike under time
pressure no longer both exist.

### Penalty

| Reason | Law infringements it covers | Seed id | Status |
| --- | --- | --- | --- |
| Illegal binding | Props not bound to the hooker (19.7a) · hooker binding incorrectly (19.7b) · locks not bound (19.7c) · back row without an arm on a lock (19.7d) · loosehead/tighthead binding arm (19.11a–b) · gripping the jersey (19.11c) · binding not maintained (19.11d) | `illegal_binding` | New |
| Illegal scrumming | Pushing not straight / boring (19.19) · pulling an opponent (19.37b, 9.19b) · lifting or forcing an opponent upwards (19.37c, 9.19c) | `illegal_scrumming` | New — the same id as the free-kick list's |
| Collapsing scrum | Intentionally collapsing (19.37d, 9.19d) · intentionally falling or kneeling (19.37e) | `collapsing_scrum` | Exists |
| Offside | Moving forward before the scrum is over (19.27) · defending scrum-half offside (19.30a–c) · non-participant inside the 5m line (19.31) · offside line breach near the try line (19.32) | `offside` | Exists |
| Other | Striking with both feet (19.21) · lifting or playing the ball above the lower legs (19.24) · receiving scrum-half's starting position (19.28a–b) · front row charging on engagement (19.37a, 9.19a) · falling on the emerging ball (19.38a) · scrum-half kicking the ball in the scrum (19.38b) · non-front-row player holding or pushing (19.38c) | `other` | Exists |

**Un-reviewed:** incorrect front-row or back-row composition (19.5) ⚠ drew no comment. It is a unit
offence and would naturally sit in `other`.

### Scrum

Ball not played out after "use it" (19.26) is **excluded** — a scrum reset, like 19.22.

### Points to settle

1. **`illegal_scrumming` sits on both lists with the same id.** A scorer picking it does not have to
   know whether the offence is a free kick or a penalty — the referee's signal already told them
   which event to open. That is the argument for one id; the counter-argument is that the same id on
   two templates makes "how many illegal-scrumming penalties" a two-template query.
2. **⚠ Two sanctions still want a referee's confirmation** — the brake-foot clauses (19.10c, 19.11e)
   and front-row composition (19.5). They are flagged in Part 1 and nothing in this round changed
   them.
3. **The scrum reset counter is now load-bearing.** Two law offences (19.22, 19.26) are deliberately
   recorded only as resets. If the counter is ever removed or made optional, those two vanish from
   the record entirely.

## 5.5 Touch, quick throw and lineout

26 law infringements collapse to **4** penalty reasons and **9** free-kick reasons — and, for the
first time, the `lineout` template gains reasons of its own. `lineout_foul` disappears, closing the
rest of gap 3.2, and gap 3.9 closes with it.

### Penalty

| Reason | Law infringements it covers | Seed id | Status |
| --- | --- | --- | --- |
| Contact | Contact with an opponent before the ball is thrown (18.21) | `contact` | New |
| Infringing jumper | Grasping an opponent in the air, or once a maul has formed (18.29e) | `infringing_jumper` | New |
| Leaving early | Leaving the lineout before it ends (18.37) | `leaving_lineout_early` | New |
| Other | Carrying the ball into touch and not releasing it (18.3) · thrower or opposite number out of position (18.28) · jumper crossing the mark of touch (18.31) · non-participant crossing the offside line (18.36) | `other` | Exists — three of the four are inferred, they drew no comment |

### Free kick

| Reason | Law infringements it covers | Seed id | Status |
| --- | --- | --- | --- |
| Not 5m | Ball fails to reach 5m, or is prevented from doing so (18.6, 18.25) | `not_5m` | New |
| Closing the gap | Closing the gap before the throw (18.10) | `closing_gap` | Exists |
| Player numbers | Non-throwing team has more players (18.14) | `too_many_players` | Exists — display rename only |
| Early jump | Pre-gripping a jumper (18.19) · lifting or jumping before the ball leaves the hands (18.20) | `early_lift` | Exists — widens to cover the pre-grip |
| Short throw | Throw fails to reach 5m before hitting the ground (18.23b) | `short_throw` | New |
| Faking throw | Dummy throw (18.24) | `faking_throw` | Exists — display rename only |
| Dangerous jump | Failing to lower a lifted team-mate safely (18.29c, 9.26) | `dangerous_jump` | New |
| Wasting time | Lineout not formed within 30 seconds (18.12) · throw not made without delay (18.23c) | `wasting_time` | Exists — **absorbs `delaying_lineout`**; the comments said "Time wasting" and "Wasting time", merged |
| Other | No player in the 5m channel (18.15) · receiver position breach (18.16) · leaving the lineout illegally (18.17a–b) · thrower steps into the field (18.22) · leaving beyond the 10m mark (18.29d) · catching or deflecting with the outside arm (18.29b) | `other` | Exists |

### Lineout — the new reason list

The comment on the quick throw settled two things at once: a lineout *can* carry a reason, and the
plain case needs one too — "another reason for lineout is just: Out".

| Reason | What put the lineout on the field | Seed id | Status |
| --- | --- | --- | --- |
| Out | Ball kicked or carried into touch — the ordinary case | `out` | New |
| Penalty | A penalty kicked to touch; the kicking team throws in | `penalty` | New |
| Free kick | A free kick kicked to touch; the opposition throws in | `free_kick` | New |
| Not straight | A previous throw not straight, where the non-throwing team elected a lineout (18.23a) | `not_straight` | New **as a reason** — see below |
| Short throw | A throw that failed to reach 5m, where a lineout was elected (18.23b) | `short_throw` | New |
| Quick throw | Quick throw taken incorrectly — wrong mark, not straight, short of 5m, feet in the field (18.4a–d) | `quick_throw` | New |

### Lineout — the outcome list keeps its detail

The outcomes are *not* cut back to won / lost. They keep the throw offences, and the stats treat
anything that hands the next throw to the opposition as a loss — which is what won / lost meant all
along. That is gap 3.7 settled, and settled without losing the detail:

| Outcome | What happened | `eventData` | Seed id | Status |
| --- | --- | --- | --- | --- |
| Won | The throwing team secured the ball | `winnerSide: "same"` | `won` | Exists |
| Lost | The opposition won the ball | `winnerSide: "other"` | `lost` | Exists |
| Not straight | Throw not straight (18.23a); the opposition takes the next throw or the feed | `winnerSide: "other"` | `not_straight` | Exists — **gains `winnerSide`** |
| Short throw | Throw failed to reach 5m before hitting the ground (18.23b) | `winnerSide: "other"` | `short_throw` | New |

**This fixes a live stat bug.** `lineoutsWon` in
[rugbyUtils.ts](file:///c:/Fred/Coding/SK/expo-app/components/sports/rugby/rugbyUtils.ts) counts a
lineout as won when `winnerSide === 'same'` and counts every lineout in the total. Today's
`not_straight` outcome carries no `eventData` at all, so it lands in the denominator and in neither
column — it depresses the success rate without ever being recorded as a loss. Giving every non-won
outcome `winnerSide: "other"` makes the rule explicit: **anything that gives the other team the
next lineout is a loss.** No client change is needed, only the seed.

**Excluded by the review:** quick throw attempted after the lineout has formed, or with a touched or
different ball (18.5a–c).

### Points to settle

1. **Settled — "Skew lineout throw" is dropped for "Not straight".** The name was attached to
   18.29b (catching or deflecting with the *outside arm*), a catching offence rather than a throwing
   one. A crooked throw is 18.23a, and it is already recorded as the `not_straight` **reason on the
   next event** — so the term is used once, in one place, and there is no `skew_throw`. The
   consequence: 18.29b has no named reason and falls into the lineout free-kick `other`. If the
   outside-arm catch turns out to be worth counting on its own, it needs a name of its own, not this
   one.
2. **`not_straight` is now both an outcome and a reason, and that is deliberate.** As an *outcome*
   it says this lineout's throw was crooked; as a *reason* on the next event it says a crooked throw
   is why that lineout or scrum exists. Same id, two roles, one law — and no migration, since stored
   `not_straight` outcomes keep their meaning and only gain `winnerSide`. `short_throw` works the
   same way. Worth confirming the pairing is intended rather than accidental, because it means the
   two events are recorded for one incident.
3. **A lineout with reasons contradicts the in-goal comment.** 21.5 (grounding while touching the
   touchline) was excluded on the grounds that "lineouts don't need a reason", which was written
   before this section decided they do. Under this list it would be reason `out`. Worth
   re-confirming.
4. **D4 gets easier but is still open.** `lineout` now has the reasons that
   `penalty_awarded` → `line_kick` → `lineout` would need to prefill, so that blocker is gone. What
   remains is whether a three-deep chain is wanted at all.

## 5.6 Kick-off and restarts

15 law infringements, and — as Part 1 already noted — they belong on the restart templates as
**outcomes**, not reasons. Two exceptions go to `penalty_awarded` and `free_kick`.

### Outcomes on `kickoff`, `dropout_22m` and `dropout_goalline`

| Outcome | Law infringements it covers | Seed id | Status |
| --- | --- | --- | --- |
| Successful | — | `successful` | Exists |
| Directly out | Ball directly into touch (12.8) · drop-out directly into touch (12.13d) | `directly_out` | Exists |
| Too short | Ball does not reach the 10m line (12.6) · drop-out does not cross the sanction line (12.13c) | `too_short` | Exists |
| Too long | Ball into the opponents' in-goal and made dead (12.9) · drop-out into the opponents' in-goal and made dead (12.18) | `long` | Exists on `kickoff` (display rename to "Too long"); **new on both drop-outs** |
| Not a drop | Not a drop kick (12.1) | `not_a_drop` | New |
| Wrong place | Kick taken from the wrong place (12.2) | `wrong_place` | New |
| In front of ball | Kicker's team in front of the ball (12.5a) · drop-out kicker's team in front (12.19) | `in_front_of_ball` | New |
| Other | Opposition in front of the 10m line (12.5b) · ball into own in-goal and made dead (12.10) | `other` | New |

### The two that are sanctions, not restart outcomes

| Reason | Template | Law | Seed id | Status |
| --- | --- | --- | --- | --- |
| Wasting time | `free_kick` | Drop-out delayed (12.13b) | `wasting_time` | Exists |
| Wasting time | `penalty_awarded` | Opponent delays or obstructs a drop-out (12.15) | `wasting_time` | **New on `penalty_awarded`** |

**Un-reviewed:** opponent advances before a drop-out (12.14, free kick) drew no comment.

### Points to settle

1. **The three restart templates should share one outcome list.** They differ today only by
   accident — `long` exists on `kickoff` and not on the drop-outs. Making them identical is simpler
   to reason about and matches how the laws treat them, but it does put "Not a drop" on templates
   where it is rare.
2. **`wasting_time` lands on three lists** — free kick (scrum 19.4, lineout 18.12 / 18.23c, drop-out
   12.13b) and penalty (12.15). One id, several groups.

## 5.7 Open play

23 law infringements collapse to **5** penalty reasons, **2** free-kick reasons, the three scrum
causes that already exist, and one card reason.

### Penalty

| Reason | Law infringements it covers | Seed id | Status |
| --- | --- | --- | --- |
| Knock down | Intentional knock forward (11.3) | `knock_down` | New |
| Offside | Interfering or not retreating (10.4a–b) · the 10-metre law (10.4c) | `offside` | Exists |
| Obstruction | Charging or pushing (9.1) · offside player obstructing (9.2) · preventing a tackle (9.3) · preventing the ball being played (9.4) · ball-carrier running into an offside team-mate (9.5) | `obstruction` | Exists — 9.5 joins it, see below |
| Professional foul | Intentionally infringing any law (9.7a) | `professional_foul` | Exists |
| Other | Intentional throw forward (11.7) · obstruction with the ball dead (9.6) · handling the ball out of play (9.7b) · simulation (9.7c) · kicking the ball from an opponent's hands (9.23) · unsportsmanlike conduct (9.27) · dissent (9.28) | `other` | Exists |

### Free kick

| Reason | Law | Seed id | Status |
| --- | --- | --- | --- |
| Mark | Mark called correctly (17) | `mark` | Exists |
| Wasting time | Wasting time (9.7d) | `wasting_time` | Exists |
| Other | Anything else, including kicking the ball away after the whistle | `other` | Exists — **absorbs `kicking_ball_away`** |

### Scrum

Knock-on (11.1–11.2), forward pass (11.6) and accidental offside (10.5) are unchanged — `knock_on`,
`forward_pass`, `accidental_offside`.

### Card

| Reason | Law | Seed id | Status |
| --- | --- | --- | --- |
| Repeated offence | Team repeatedly committing the same offence (9.8, 9.10) | `repeated_infringements` | Exists on `yellow_card` — display rename to "Repeated Offence" |

**Excluded by the review:** player repeatedly infringing (9.9). The team offence is kept as a card
reason and the individual one is dropped.

### Points to settle

1. **Settled — 9.5 becomes `obstruction`, not `accidental_offside`.** Accidental offside can be
   sanctioned two ways depending on how it happened: 10.5 gives a scrum, 9.5 gives a penalty. Rather
   than one id carrying both meanings across two templates, the penalty case takes the name the law
   already gives it — 9.5 sits in Law 9's obstruction cluster with 9.1–9.4, so it folds into the
   existing `obstruction` reason and no new id is created. `accidental_offside` is left meaning one
   thing: 10.5, on `scrum`.
2. **`knock_down` versus `knock_on`.** A deliberate knock-down (penalty) and a knock-on (scrum) are
   one letter apart in the feed. Worth checking the wording survives a glance at a match card.
3. **Dropping 9.9 loses the individual case.** A player penalised repeatedly is the usual route to a
   yellow; excluding it means the card's reason reads as a team offence even when one player caused
   it. Confirm that is intended.

## 5.8 In-goal

10 situations, two of them excluded and the rest split across the scrum, the drop-outs and the
penalty list.

### Scrum

| Reason | Situation | Seed id | Status |
| --- | --- | --- | --- |
| Held up | Ball held up in-goal (21.16) · doubt about which team grounded first (21.17) | `held_up` | Exists — widens to cover the doubt case |
| Carried back | Defending team takes the ball into their own in-goal and makes it dead (21.4) | `carried_back` | **New — `held_up` is being stretched to cover this today** (gap 3.8) |
| Dead ball | Ball kicked through the in-goal into touch-in-goal or dead (21.11), where the defending team elects a scrum | `dead_ball` | New |

### Penalty

| Reason | Situation | Seed id | Status |
| --- | --- | --- | --- |
| Double movement | Reaching out to ground the ball after being tackled short (21.8) | `double_movement` | New |
| Other | Kicking the ball from a player reaching out to ground it (21.10) | `other` | Exists |

### Drop-outs

Attacking team plays the ball into in-goal and it is made dead (21.4) produces a try-line drop-out;
21.11 can produce a 22m drop-out. Both were commented "Dead ball".

**Excluded by the review:** unsuccessful kick at goal or drop goal made dead (21.11) — "not needed";
ball-carrier grounds the ball while touching the touchline (21.5) — "will just result in a lineout".

### Points to settle

1. **Does a drop-out need a reason at all?** "Dead ball" is the only cause the review kept, and a
   one-option reason list is a screen that answers nothing. Either the drop-out templates stay
   reason-less and `dead_ball` exists only as the *scrum* reason above, or they gain a list on the
   assumption more causes follow. The former is the recommendation.
2. **The penalty try has no reason list.** The comment renamed the row to "Foul play", but
   `penalty_try` carries no `reasons` today and every penalty try has the same cause by definition.
   Leave it as it is unless the card that accompanies it should be linked (D1).
3. **21.5 conflicts with 5.5** — see point 3 there.

## 5.9 Administering a penalty or free kick

6 infringements. One is a penalty; the rest award a scrum, which means the `scrum` reason list has to
grow two options it has never had.

| Reason | Template | Law | Seed id | Status |
| --- | --- | --- | --- | --- |
| Not 10m back | `penalty_awarded` | Opposition not retreating 10m, or delaying the kick (20.12–20.15) | `not_10m_back` | New — the sanction is a **second penalty, 10m forward** |
| Offside | `scrum` | Kicker's team in front of the ball (20.10) | `offside` | **New on `scrum`** |
| Other | `scrum` | Not taking the kick without delay (20.5) · using the wrong ball (20.7) · a free kick fairly charged down (20.16–20.17) | `other` | **New on `scrum`** |

**Un-reviewed:** ball not kicked a visible distance (20.11) drew no comment; it belongs in the same
`other`.

### Points to settle

1. **`not_10m_back` records a penalty whose sanction is another penalty.** Whether the 10m advance is
   a second `penalty_awarded` event or an annotation on the first is not something the reason list
   can answer. A second penalty against the same team is the simplest reading and double-counts
   nothing, since the first was never taken.
2. **The `scrum` reason list gains an administrative group.** With `offside` and `other` on it, the
   list stops being purely "what happened in play". Worth a second group name rather than one flat
   list of twelve.

## 5.10 What the review excluded

Six rows were deliberately kept out of the templates. Recorded here so a later pass does not "find"
them again:

| Situation | Law | Why |
| --- | --- | --- |
| Hooker of the feeding team fails to strike | 19.22 | Counted as a scrum reset |
| Ball not played out after "use it" (scrum) | 19.26 | Counted as a scrum reset |
| Quick throw after the lineout has formed, or with a touched or different ball | 18.5a–c | Not worth a reason |
| Player repeatedly infringing | 9.9 | The team offence (9.8, 9.10) is kept as a card reason instead |
| Unsuccessful kick at goal or drop goal made dead | 21.11 | Not needed |
| Ball-carrier grounds the ball while touching the touchline | 21.5 | Results in a lineout — but see 5.5 point 3 |

## 5.11 Rollup — what each template becomes

The same lists, arranged the way the seed is. This is the edit `SCORE-11` ends in; nothing here is
applied yet, and D1–D7 still gate the card templates and every id migration.

### `penalty_awarded` — 9 groups

| Group | Reasons |
| --- | --- |
| Tackle | Dangerous tackle · Tackle without ball · Tackle in the air · Tip tackle · Tackler not releasing · Tackler not rolling away · Not releasing the ball · Playing on the ground · Offside · Other |
| Ruck | Illegal entry · Offside · Hands in ruck · Off feet · Collapsing · Dangerous play · Other |
| Maul | Offside · Illegal entry · Collapsing · Obstruction · Other |
| Scrum | Illegal binding · Illegal scrumming · Collapsing scrum · Offside · Other |
| Lineout | Contact · Infringing jumper · Leaving early · Other |
| Restart | Wasting time |
| In-goal | Double movement · Other |
| Open play | Knock down · Offside · Obstruction · Professional foul · Other |
| Technical | Not 10m back |

Gone: `late_tackle` (into `tackle_without_ball`), `scrum_other` (into `illegal_binding` /
`illegal_scrumming` / `other`), `lineout_foul` (into the four lineout reasons).

### `free_kick` — 14 distinct reason ids

| Group | Reasons |
| --- | --- |
| Scrum | Illegal scrumming · Illegal feed · Foot up · Wasting time · Other |
| Lineout | Not 5m · Closing the gap · Player numbers · Early jump · Short throw · Faking throw · Dangerous jump · Wasting time · Other |
| Ruck | Other |
| Maul | Illegal entry · Other |
| Restart | Wasting time |
| Open play | Mark · Wasting time |

Gone: `pre_engagement` and `delaying_feed` (into `illegal_scrumming` / `illegal_feed`),
`delaying_lineout` (into `wasting_time`), and — neither having drawn a comment — `early_push`
(19.17) and `kicking_ball_away` (gap 3.6), both into `other`. Gap 3.6 is therefore closed by
deletion rather than by moving the reason to `penalty_awarded`; if kicking the ball away after the
whistle turns out to be worth its own option it belongs there, not here.

### `scrum` — 16 reasons

Every cause that puts a scrum on the field, including the three lineout offences a team can elect a
scrum from and the restart offences D5 says we record only through their consequence. Listed with
final ids in 6.3.

### `lineout` — 7 reasons, 4 outcomes

Reasons, all new: `out` · `penalty` · `free_kick` · `not_straight` · `short_throw` · `quick_throw` ·
`restart_offence`.
Outcomes: `won` · `lost` · `not_straight` · **`short_throw`** — every one of them except `won`
carries `winnerSide: "other"`, so the stats count it as a loss.

### `kickoff`, `dropout_22m`, `dropout_goalline` — 8 shared outcomes

`successful` · `directly_out` · `too_short` · `too_long` · `not_a_drop` · `wrong_place` ·
`in_front_of_ball` · `other`.

### Cards

D1 settled it: a card is its own event with its own reason list, not a child of a penalty. The
overlap with `penalty_awarded` is deliberate — the same offence can be a penalty reason and a card
reason — but the *wording* must match across the two, and a card carries reasons no penalty has
(repeated infringement, a second yellow). Drafted with final ids in 6.5.

### Migrations this creates

**None.** D6 settled that there are no meaningful stored events, so the ids are being chosen rather
than migrated — see Part 6. The table that used to sit here listed nine rewrites; every one of them
is now just a decision about what to type into the seed.

---

# Part 6 — The final lists, with ids

This is the spec. Part 5 argued it out; this is what goes into
[rugby.seed.ts](file:///c:/Fred/Coding/SK/server/src/scripts/setup/seeds/sports/rugby.seed.ts).
Written after **D6** freed us to pick ids rather than migrate them, so nothing here is constrained by
what is already stored.

**Two conventions, applied everywhere.**

1. **Every reason id on `penalty_awarded` and `free_kick` is prefixed with its phase** — `tackle_`,
   `ruck_`, `maul_`, `scrum_`, `lineout_`, `restart_`, `ingoal_`, `open_`, `tech_`. Three reasons
   for it: reason ids must be unique within a template, and "offside" occurs in five phases; the
   phase is then recoverable from a stored event without knowing how the picker was grouped at the
   time; and "penalties conceded at the scrum" becomes a prefix match rather than a hand-maintained
   list. It also settles gap 3.4 by construction — one id per phase, never a shared one.
2. **A reason's name never repeats its phase.** The group already says "Lineout", so the option is
   "Short throw", not "Short lineout throw"; "Early jump", not "Early lineout jump". The phase is in
   the id and above the list — saying it a third time only makes the option harder to scan.
3. **`specifyPlayer` is `true` on every option** (D7). The column below flags the ones that look like
   unit offences, as a starting point for the cleanup pass, but the seed ships them all `true`. The
   cards are the exception that is a rule rather than a default — see 6.5.

The group order is the picker order — how often the phase occurs, not the alphabet.

## 6.1 `penalty_awarded` — 40 reasons in 9 groups

| Group | Name | Id | Unit offence? |
| --- | --- | --- | --- |
| **Tackle** | Dangerous tackle | `tackle_dangerous` | |
| | Tackle without ball | `tackle_no_ball` | |
| | Tackle in the air | `tackle_in_air` | |
| | Tip tackle | `tackle_tip` | |
| | Tackler not releasing | `tackle_tackler_not_releasing` | |
| | Tackler not rolling away | `tackle_tackler_not_rolling` | |
| | Not releasing the ball | `tackle_not_releasing` | |
| | Playing on the ground | `tackle_on_ground` | |
| | Offside | `tackle_offside` | |
| | Other | `tackle_other` | |
| **Ruck** | Illegal entry | `ruck_illegal_entry` | |
| | Offside | `ruck_offside` | |
| | Hands in ruck | `ruck_hands_in` | |
| | Off feet | `ruck_off_feet` | |
| | Collapsing | `ruck_collapsing` | |
| | Dangerous play | `ruck_dangerous_play` | |
| | Other | `ruck_other` | |
| **Scrum** | Illegal binding | `scrum_illegal_binding` | yes |
| | Illegal scrumming | `scrum_illegal_scrumming` | yes |
| | Collapsing scrum | `scrum_collapsing` | yes |
| | Offside | `scrum_offside` | |
| | Other | `scrum_other` | |
| **Lineout** | Contact | `lineout_contact` | |
| | Infringing jumper | `lineout_infringing_jumper` | |
| | Leaving early | `lineout_leaving_early` | |
| | Other | `lineout_other` | |
| **Maul** | Offside | `maul_offside` | |
| | Illegal entry | `maul_illegal_entry` | |
| | Collapsing | `maul_collapsing` | |
| | Obstruction | `maul_obstruction` | |
| | Other | `maul_other` | |
| **Open Play** | Knock down | `open_knock_down` | |
| | Offside | `open_offside` | |
| | Obstruction | `open_obstruction` | |
| | Professional foul | `open_professional_foul` | |
| | Other | `open_other` | |
| **Restart** | Wasting time | `restart_wasting_time` | |
| **In-goal** | Double movement | `ingoal_double_movement` | |
| | Other | `ingoal_other` | |
| **Technical** | Not 10m back | `tech_not_10m_back` | yes |

Outcomes are unchanged: `penalty_kick` · `line_kick` · `scrum` · `tap_go`, the first three
`triggerTeam: "opponent"`, and `scrum` prefilling `triggerEventData: { reason: "penalty" }` — note
the new id, `penalty_scrum` is gone (gap 3.10).

## 6.2 `free_kick` — 21 reasons in 6 groups

| Group | Name | Id | Unit offence? |
| --- | --- | --- | --- |
| **Scrum** | Illegal scrumming | `scrum_illegal_scrumming` | yes |
| | Illegal feed | `scrum_illegal_feed` | |
| | Foot up | `scrum_foot_up` | |
| | Wasting time | `scrum_wasting_time` | yes |
| | Other | `scrum_other` | |
| **Lineout** | Not 5m | `lineout_not_5m` | |
| | Closing the gap | `lineout_closing_gap` | yes |
| | Player numbers | `lineout_player_numbers` | yes |
| | Early jump | `lineout_early_jump` | |
| | Short throw | `lineout_short_throw` | |
| | Faking throw | `lineout_faking_throw` | |
| | Dangerous jump | `lineout_dangerous_jump` | |
| | Wasting time | `lineout_wasting_time` | yes |
| | Other | `lineout_other` | |
| **Ruck** | Other | `ruck_other` | |
| **Maul** | Illegal entry | `maul_illegal_entry` | |
| | Other | `maul_other` | |
| **Open Play** | Mark | `open_mark` | |
| | Wasting time | `open_wasting_time` | |
| | Other | `open_other` | |
| **Restart** | Wasting time | `restart_wasting_time` | |

Outcomes unchanged: `scrum` · `line_kick` · `tap_go`, with `scrum` prefilling
`triggerEventData: { reason: "free_kick" }`.

Note the same ids appear on both templates where the offence exists on both — `scrum_other`,
`ruck_other`, `maul_illegal_entry`. That is intentional: one offence, one id, whichever sanction it
drew. The template already says which sanction it was.

## 6.3 `scrum` — 16 reasons in 5 groups

Every cause that puts a scrum on the field. Two of them are prefilled by a parent's
`triggerEventData`, which is why their ids are worth getting right now.

| Group | Name | Id | Note |
| --- | --- | --- | --- |
| **Open Play** | Knock-on | `knock_on` | |
| | Forward pass | `forward_pass` | |
| | Accidental offside | `accidental_offside` | 10.5 — the *only* meaning this id now has |
| **Breakdown** | Ruck unplayable | `ruck_unplayable` | 15.20 |
| | Maul unplayable | `maul_unplayable` | 16.8, 16.14, 16.17 — the maul dies, the put-in goes to the other team |
| **Lineout** | Not straight | `lineout_not_straight` | 18.23a, where a scrum was elected |
| | Short throw | `lineout_short_throw` | 18.23b |
| | Quick throw | `lineout_quick_throw` | 18.4a–d |
| **In-goal** | Held up | `held_up` | 21.16, and doubt over the grounding 21.17 |
| | Carried back | `carried_back` | 21.4, defender makes it dead in their own in-goal |
| | Dead ball | `dead_ball` | 21.11, where a scrum was elected |
| **Sanction** | Penalty | `penalty` | **Prefilled** by `penalty_awarded` → `scrum` |
| | Free kick | `free_kick` | **Prefilled** by `free_kick` → `scrum` |
| | Restart offence | `restart_offence` | A kick-off or drop-out offence where a scrum results (D5: we record the scrum, not the election) |
| | Offside at the kick | `tech_offside` | 20.10 |
| | Other | `tech_other` | 20.5, 20.7, 20.11, 20.16–20.17 |

Outcomes are unchanged — `won` / `lost` — as is the `ScrumResetsCounter`, which now carries two law
offences on its own (19.22, 19.26).

## 6.4 `lineout` — 7 reasons, 4 outcomes

D4 means nothing prefills these: the scorer records the lineout and picks why it is there.

| Group | Name | Id | Note |
| --- | --- | --- | --- |
| **Open Play** | Out | `out` | Kicked or carried into touch — the ordinary case |
| **Sanction** | Penalty | `penalty` | Kicked to touch; the kicking team throws in |
| | Free kick | `free_kick` | Kicked to touch; the opposition throws in |
| | Restart offence | `restart_offence` | A kick-off or drop-out into touch, where a lineout results |
| **Lineout** | Not straight | `not_straight` | The previous throw (18.23a) |
| | Short throw | `short_throw` | The previous throw (18.23b) |
| | Quick throw | `quick_throw` | A quick throw taken incorrectly (18.4a–d) |

| Outcome | Id | `eventData` |
| --- | --- | --- |
| Won | `won` | `winnerSide: "same"` |
| Lost | `lost` | `winnerSide: "other"` |
| Not straight | `not_straight` | `winnerSide: "other"` |
| Short throw | `short_throw` | `winnerSide: "other"` |

Reason ids and outcome ids live in separate namespaces, so `not_straight` and `short_throw`
appearing in both lists is legal and deliberate — as an outcome it is this lineout's throw, as a
reason it is the previous one.

## 6.5 Cards — two templates, one list each (D1)

A card is its own event. Where an offence is also a penalty reason the **wording matches** —
"Dangerous tackle" is called that on both — but the ids are the card templates' own, and the lists
carry offences no penalty list has.

**One group per template** (2026-08-19). Nine reasons do not need dividing into Foul Play and
Technical; the split cost a header and bought nothing. Each template gets a single group, which also
means the cards take the *flat* chip list in the 4.1 picker rather than the phase grid — the picker
should suppress the group header when a template has only one group.

**A card always names a player.** A card is given to a person, so every reason carries
`specifyPlayer: true` and the player step is never skipped — `repeated_offence` included, where the
*offence* is the team's but the card still goes to somebody. On the cards this is a rule, not the D7
default sitting unexamined, and the D7 pass must not switch any of them off.

### `yellow_card` — 9 reasons

| Name | Id |
| --- | --- |
| Dangerous tackle | `dangerous_tackle` |
| Tip tackle | `tip_tackle` |
| Tackle in the air | `tackle_in_air` |
| Croc roll | `croc_roll` |
| Dangerous play | `dangerous_play` |
| Professional foul | `professional_foul` |
| Repeated offence | `repeated_offence` |
| Offside | `offside` |
| Other | `other` |

`cynical_foul` is gone — it was `professional_foul` under a second name (gap 3.11).
`repeated_infringements` becomes `repeated_offence` and means the team offence (9.8, 9.10); the
individual case (9.9) was excluded by the review.

### `red_card` — 9 reasons

| Name | Id |
| --- | --- |
| Punching or striking | `punching_striking` |
| Stamping or kicking | `stamping_kicking` |
| Biting or eye contact | `biting_eye_contact` |
| Retaliation | `retaliation` |
| Dangerous tackle | `dangerous_tackle` |
| Tip tackle | `tip_tackle` |
| Dangerous play | `dangerous_play` |
| Second yellow card | `second_yellow` |
| Other | `other` |

### `timed_red_card` is deleted — the 20-minute red is an *upgrade*

How it actually works on the field: the referee shows a **yellow** and signals it for review. The TMO
looks at it, and the card either stands or is upgraded. Nobody walks out and shows a 20-minute red
from a standing start, so a third card button was modelling a thing that does not happen — and worse,
it made the upgrade unrecordable: the scorer would have had to delete the yellow and create a
different event, losing the fact that a review happened at all.

So the review lives on `yellow_card` as its **outcome**:

| Outcome | Name | Means | Sin bin |
| --- | --- | --- | --- |
| `stands` | Yellow | No review, or the review confirmed the yellow | 10 minutes, `type: "yellow"` |
| `under_review` | Under Review | Shown and sent to the TMO; the answer is not in yet | 10 minutes, `type: "yellow"` |
| `upgraded_timed_red` | Upgraded — 20-min Red | Review upgraded it; the team may replace the player after 20 minutes | 20 minutes, `type: "red"` |
| `upgraded_red` | Upgraded — Red | Review upgraded it to a full red | Permanent, `type: "red"` |

`under_review` is a real outcome rather than an unset one on purpose: "the TMO is looking at it" and
"the scorer has not filled this in" must not look the same in the feed. The scorer picks `stands` on
the ordinary yellow and never thinks about the rest.

A red shown directly on the field stays `red_card`, and gains the same distinction as an outcome:

| Outcome | Name | Sin bin |
| --- | --- | --- |
| `permanent` | Red | Permanent |
| `timed` | 20-min Red | 20 minutes, `type: "red"` |

`second_yellow` can never be a 20-minute red (gap 3.12), so that reason and the `timed` outcome are
mutually exclusive — worth a check rather than trusting the scorer under pressure.

### What this costs on the server

Cards are the one template family whose events write to `live_state.sinBins`, and
[GameEventManager.ts](file:///c:/Fred/Coding/SK/server/src/managers/GameEventManager.ts) keys all of
that off `subType`. Three changes, and the second is the substantial one:

1. **Duration comes from the outcome, not the subType.** `isTimedRed` is currently
   `subType === 'timed_red_card' && settings.allowTimedRedCard`; it becomes a read of the card's
   outcome, with `allowTimedRedCard: false` degrading an upgrade to a permanent red. Every
   `subType === 'timed_red_card'` test — there are four — goes away with the template.
2. **The sin bin has to follow a mutation.** Today `sinBins` is written on create and deleted on
   remove, and nothing rewrites it in between — so the whole point of this design, changing a
   yellow's outcome, would leave the scoreboard showing 10 minutes forever. The mutation engine needs
   to re-derive the entry (its `type` and `durationMS`, keeping the original `awardedAtMS`) whenever a
   card event changes. That is not extra work this design invents: editing *any* card today already
   leaves a stale sin bin, it is simply never noticed because nothing else changes a card's meaning.
3. **Nothing else moves.** A 20-minute red is already expressible — `type: "red"` with a
   `durationMS` — so `SinBinBadge` counts it down without a change, and a permanent red keeps
   `durationMS: 0` and reads "RED".

## 6.6 The restart templates — one shared outcome list

`kickoff`, `dropout_22m` and `dropout_goalline` all take the same eight outcomes.

| Name | Id | Law |
| --- | --- | --- |
| Successful | `successful` | — |
| Directly out | `directly_out` | 12.8, 12.13d |
| Too short | `too_short` | 12.6, 12.13c |
| Too long | `too_long` | 12.9, 12.18 |
| Not a drop | `not_a_drop` | 12.1 |
| Wrong place | `wrong_place` | 12.2 |
| In front of ball | `in_front_of_ball` | 12.5a, 12.19 |
| Other | `other` | 12.5b, 12.10 |

`long` becomes `too_long` — a rename D6 makes free, and it reads consistently beside `too_short`.
Per D5 the election is not recorded: if the receiving team takes a scrum or a lineout, that event is
recorded next with reason `restart_offence`.

## 6.7 What still has to happen

1. **Write the seed**, then re-sync the stored specs with `sync_db_rugby_templates.ts` and run
   `check_rugby_templates.ts` — the prefill contract changed (`penalty_scrum` → `penalty`), which is
   exactly what that check exists to catch.
2. **Reset the existing `game_events`.** D6 assumes there is nothing worth keeping; that assumption
   should be verified against the database rather than remembered, and the reset done before the new
   ids ship.
3. **Add `winnerSide: "other"`** to the lineout's non-won outcomes, which fixes the stat bug in
   `rugbyUtils.ts` without touching the client.
4. **Build the phase picker** (4.1) before the long lists land in front of a scorer — 40 options in a
   flat wrapped-chip list is the failure mode D2 was answered to avoid.
5. **The D7 pass**: turn `specifyPlayer` off where it is genuinely inapplicable. The "Unit offence?"
   column in 6.1 and 6.2 is the starting list, not the answer.
6. **The card rework is a server change, not a seed change** (6.5). Deleting `timed_red_card` means
   four `subType === 'timed_red_card'` tests come out of `GameEventManager`, the sin-bin duration
   starts reading the card's *outcome*, and — the real work — the mutation engine has to rewrite an
   existing sin-bin entry when a card event changes. Sequence it before or with the seed edit, or a
   yellow upgraded to a 20-minute red will read as a 10-minute yellow on the scoreboard for the rest
   of the match.
7. **21.5 still contradicts 5.5** — a ball grounded while touching the touchline was excluded because
   "lineouts don't need a reason", written before lineouts got reasons. Under 6.4 it is reason `out`.
