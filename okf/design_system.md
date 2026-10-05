---
type: concept
title: Design System & Styling Rules
description: Styling tokens, core themes, typography rules, layout grids, and accessibility requirements.
tags:
  - concept
  - design-system
  - styling
  - theme
  - accessibility
timestamp: 2026-10-04T00:00:00Z
---

# Design System & Styling Rules

ScoreKeeper features a premium, dark-mode-first aesthetic inspired by modern live sports interfaces, with deep contrasts and high-energy accents.

For the full detailed design principles, see [design_spec.md](file:///c:/Fred/Coding/SK/docs/design_spec.md).

## Theme Colors & Variables

**Name a colour by its purpose, and let the theme pick the shade** (2026-10-03, `UI-24`). Every colour is a token in [theme.js](file:///c:/Fred/Coding/SK/expo-app/constants/theme.js) with a light and a dark value. In a class, write the token — `text-ink-muted`, `bg-card`, `border-line`, `bg-success-soft` — never a palette shade with a hand-written `dark:` partner, which is how the app came to have screens with no dark half and fifty-one classes naming shades Tailwind does not have (`text-slate-850`), each silently applying no colour. Where a class cannot reach (an icon's `color`, `placeholderTextColor`, an inline style), use `themeColor(isDark, token)` from [Colors.ts](file:///c:/Fred/Coding/SK/expo-app/constants/Colors.ts), with an optional opacity (`themeColor(isDark, 'overlay', 0.8)`) as the twin of a class's `/80`. The tokens become CSS variables on `:root` and `.dark:root` through [tailwind.config.js](file:///c:/Fred/Coding/SK/expo-app/tailwind.config.js); a class only *reads* one, so it never trips the variable-provider remount of `UI-1`. **Restart Metro after changing `theme.js` or the Tailwind config** — NativeWind reads them only at start-up, and a running server goes on serving the old classes.

The whole app moved onto the tokens on 2026-10-04, and `npm run check:colors -- --strict` — run by the pre-commit hook — now rejects any colour named by shade: a palette class, `brand-*`, `white` or `black`, a hex or `rgba(…)` string. It also checks each text token's contrast on the surfaces it is read on (`--contrast` prints the table). The legacy `COLORS` table, `getThemeColor()` and the `brand-*` Tailwind colours are gone.

| Token | What it is for |
|---|---|
| `canvas` | The page behind everything. |
| `card` | A card, panel or list. `<GlassCard>` paints it unless its `className` names its own `bg-`. |
| `sunken` | Set into a card: a chip, a segmented track, a stat tile. |
| `field` | The inside of a text input or a closed select. |
| `raised` | Lifted off a sunken track: the selected segment, a page number, a stepper button. |
| `popover` | A dialog, sheet or menu floating over the page (a step lighter than `card` in dark mode). |
| `tooltip` | A tooltip's dark bubble, in both themes; its text is `on-fill`. |
| `overlay` | The scrim behind a dialog, always with an opacity (`bg-overlay/60`). |
| `shadow` | A drop shadow's `shadowColor`. |
| `logo-plate` | The white plate behind an org logo, in both themes. |
| `ink`, `ink-soft`, `ink-muted` | Text: names and values; body a step down; labels, counts and meta lines. All clear 4.5:1 on every surface. |
| `ink-faint` | Placeholders, disabled text and decoration — never text that must be read. |
| `on-fill`, `on-bright` | White and near-black in both themes, for what is dark or bright in both: a tooltip, the scrim, a photo, a logo plate, a yellow card. Not for a tone's fill — use `on-<tone>`. |
| `line`, `line-soft`, `line-strong` | Borders, row dividers, and a border that must stand out. |
| `line-selected` | The edge of a chosen option: a selected segment, the active pill tab, a ticked chip. Light grey on light, near-white on dark. |
| tone, `on-<tone>`, `-ink`, `-soft`, `-line` | For each of `primary`, `accent`, `success`, `warning`, `danger`, `info`, `special`: the fill (a button, a dot); the label and icon colour on that fill; the readable shade for text **and for icons on the tone's own tint**; the tint; and the tint's border. |

*   **A label on a tone's fill** — a button's text, its icon, its spinner — takes that tone's `on-<tone>`: `bg-success` with `text-on-success`, `themeColor(isDark, 'on-success')` (2026-10-04, `UI-25`). Each is worked out in theme.js as white or near-black, whichever reads better on the fill in that theme, so none is chosen by hand: near-black on the brand orange (5.7:1, where white was 3.5:1) and on the bright dark-mode fills, white on the darker light-mode ones. `check:colors` fails a class string that puts a tone's fill and any other text colour on one element, and tests every `on-<tone>` against its fill.
*   **Never fade content to say it is unavailable, waiting or out of use** (2026-10-04, found on the tournament setup mockup). Opacity lowers every line on the faded thing at once — a step card at 62% took its summary to 2.4:1 and its number to 1.7:1 in light mode, under the 4.5:1 that text must reach. Say the state instead: in words ("Not started", "Starts once there are divisions"), with a status tag, or by a grey segment or ring — and leave the text at full strength in `ink`, `ink-soft` or `ink-muted`. `ink-faint` is for decoration (a ring, a divider, a placeholder), never for text someone needs to read, a step's number included. **The one exception is a disabled control** — a button or option that cannot be used right now may drop to `opacity-40`, as the app's buttons do, since a control that cannot be operated is exempt from the contrast minimum; a row, a card or a record is not a control.
*   **Icons in a tone** may use the fill (`themeColor(isDark, 'primary')`) on a card, where it reaches the 3:1 icons need — except `warning` and `accent`, which are under 2.2:1 on white in light mode and always take `-ink`. On a tone's own `-soft` tint, use `-ink`.
*   **Colours that are data, not theme** — an org's brand colour, a colour picker's swatches, the black or white worked out to read on a colour — are exempt from the check — and so is no CSS colour name: `color="white"` is a raw colour like a hex, and the check rejects it. A file marks itself with `@colour-data` in a comment, saying why, or a single line with a `colour-data: <why>` comment at its end or on the line above. Content drawn over an org's brand colour takes its shades from `inkOnBrand(hex)` in [colorUtils.ts](file:///c:/Fred/Coding/SK/expo-app/utils/colorUtils.ts).
*   **Brand identity**: **Electric Orange** (`#FF3E00`, the `primary` fill), **Electric Blue** (`#00E5FF`, the `accent` fill), Neon Red, Emerald Green and the brand yellow live on as the dark-mode values of `danger`, `success` and `warning`. In light mode the tokens swap to shades that read on white.

## Typography

*   **Orbitron** (Geometric digital font): Used exclusively for numbers, scoreboards, match clocks, and the main app logo.
*   **Inter / Roboto**: Used for all standard body text, participant rosters, and smaller UI labels.

## Grid & Layouts

*   **8-Point Grid**: All spacing, margins, padding, and layout bounds must align to an 8-point grid (8, 16, 24, 32, etc.).
*   **Card Padding**: Standard containers use `16px` or `24px` internal padding.

## Light Mode Accessibility

The light-mode swaps that used to be written out per screen — deep cyan for the electric blue (1.25:1 on white), deep emerald for the success green (1.67:1), amber for the brand yellow — are now the light values of the `accent-ink`, `success-ink` and `warning-ink` tokens. Use the `-ink` token wherever a tone carries meaning as text or as an icon on its tint, and `check:colors` holds every text token at 4.5:1 or better in both themes.

## Custom Overlays & Dialogs (No Native Popups)

To maintain a consistent, premium live-sports aesthetic and prevent silent failures across multiple targets:
*   **No Native Dialogs**: Do not use platform-native alert popups (like React Native's `Alert.alert` or default browser `alert`/`confirm` dialogs) for warnings, deletions, or configuration edits.
*   **Custom Overlays**: Always design and render custom, theme-aware overlay modals (using `Modal` or inline styled cards with blur backdrops) for interactive confirm-destructive flows. This ensures proper layout, cross-compatible interaction, and blocks browser popup interceptors.

## Segmented Controls vs Action Triggers

*   **Action Triggers**: Primary actions (Save, Submit, Score Match) use solid filled brand accent buttons.
*   **Segmented View Switchers**: Multi-state view selectors (e.g. Readonly / Edit Info / Score Match, theme preference, settings sub-tabs) must be enclosed inside a single rounded track (`bg-sunken`) with elevated indicator tiles (`bg-raised` + `border-line-selected`), distinguishing selection state from action buttons.
*   **A chosen option is never orange** (`UI-26`, 2026-10-04). It is raised out of its track, in `ink`, with a `line-selected` edge — a segment, a pill tab, an option row in a dropdown, a ticked chip (which also gets a ✓). An underline tab's underline is `ink`. Orange is kept for **actions** and for **a filter or search that is narrowing a list** (an active filter chip, the Filters button while any is on, a search box holding a term): a switch always has one option chosen, so an orange one looks like a button, and puts orange on every toolbar where it drowns the one signal worth seeing. A ticked checkbox and a chosen radio dot keep their standard orange fill — those are controls, not the option itself.
*   **Generic Component Reuse**: Consume the reusable `<SegmentedControl>` component (`expo-app/components/SegmentedControl.tsx`) across all view switchers and preference selectors to prevent duplicate UI code and ensure single-source-of-truth styling. A list filter beside a search box uses its `fit` mode with per-option `count`s: segments size to their labels, and the counts are dropped (shown on hover, on web) before any label is cut short.

## One Component Per Repeated Concept

*   **An organisation with no administrator**: Ask about it only through [`<NominateAdminModal>`](file:///c:/Fred/Coding/SK/expo-app/components/NominateAdminModal.tsx), opened from the workspace's one-line [`<UnclaimedOrgBanner>`](file:///c:/Fred/Coding/SK/expo-app/components/UnclaimedOrgBanner.tsx), the [`<UnclaimedOrgBadge>`](file:///c:/Fred/Coding/SK/expo-app/components/UnclaimedOrgBadge.tsx) icon on an org chip, or the workspace's Nominate admin page (`/admin/[orgId]/nominate`) — never an inline card or an email field held until a form saves (`ORG-6`). Amber means *you* have not nominated anyone for it, green that you have. The process: [nomination-process.md](file:///c:/Fred/Coding/SK/docs/nomination-process.md) §4.

*   **An organisation's colours**: Take them from `orgColors(org)` in `@sk/shared`, never `org.primaryColor || '#…'`. **A new organisation starts in the app's two colours**, orange and electric blue, until an admin sets its own, so banners show two colours from the start. **After that, each colour falls back to the one before it**: an admin may clear the secondary, and the org is then painted in its primary alone; the primary is required on every organisation (`20261003_org_primary_color_required.ts`), falling back to the app's orange only for data that predates that. Decided 2026-10-01 and 2026-10-03; it replaced over thirty hand-written fallbacks.

*   **A side of a fixture**: Render it with [`<FixtureSide>`](file:///c:/Fred/Coding/SK/expo-app/components/FixtureSide.tsx), never with ad-hoc text. A side is in one of three states — a known competitor, an entrant awaiting confirmation ("TBC — awaiting confirmation"), or a slot awaiting a result ("Winner QF1") — and the fixtures list, the schedule, the bracket, the game screen, the standings and anything printed all show them. Five independent renderings of "TBC" is a guaranteed inconsistency. The wording itself is derived in [`shared/src/utils/fixtureSide.ts`](file:///c:/Fred/Coding/SK/shared/src/utils/fixtureSide.ts), so the server and print paths say the same thing the screen does; a placeholder is drawn in secondary text (AAA in Light Mode) rather than at a lower opacity, so it stays legible.

*   **Saving an edited record**: Every admin screen that edits a record in place — **except a read-first page, below** — saves through [`<FloatingSaveBar>`](file:///c:/Fred/Coding/SK/expo-app/components/FloatingSaveBar.tsx) — a card pinned to the bottom of the screen once the form is dirty, naming what changed and carrying Cancel and Save. Never a save button under a section: a screen with two of them is a screen with two writes to one row. Three things go together and the component's doc comment says so — the bar, `useUnsavedChanges(isDirty, onCancel)` so that leaving warns and *discarding* runs the same reset Cancel does, and `paddingBottom: isDirty ? FLOATING_SAVE_BAR_PADDING : 60` on the scroll container so the bar never covers the last field. Extracted 2026-09-08 from nine screens that had each copy-pasted it; `UI-3` tracks moving those nine onto it.

*   **The top of a pushed screen**: Use [`<ScreenHeader>`](file:///c:/Fred/Coding/SK/expo-app/components/ScreenHeader.tsx) — back control on the left, screen name centred, an optional action on the right. It takes `onBack` rather than an href, because a screen with unsaved edits routes back through `confirmThenNavigate` and one without routes through [`useSafeBack`](file:///c:/Fred/Coding/SK/expo-app/hooks/useSafeBack.ts), and the component should not know which. The right slot defaults to a fixed-width spacer and needs to stay one: the title is centred in the row, so without a counterweight it drifts as the label changes. Extracted 2026-09-13 (U48) rather than writing the same eighteen lines four more times; `UI-10` tracks the screens still holding their own copy. The event screen joined them the same day (U49), and is the worked example of the `right` slot carrying something real — an `<OverflowMenu>` rather than a spacer.

*   **A form split across several screens**: Each screen owns its dirty state, its own `<FloatingSaveBar>`, and **only its own fields in the write** — see the tournament setup steps (U48). The rule above still holds inside a screen; what this adds is the rule between them. `UPDATE_EVENT`-style actions are patches, so a screen writing only what it edits cannot clobber a sibling's fields — but a **JSONB column is replaced, not merged**, so any screen touching one must spread the existing object or it silently drops what another screen wrote there. Every such screen must also clear the unsaved-changes store on a successful save, or it stays dirty and the next navigation raises a discard dialog over changes already written.

*   **A field that needs explaining**: Label it with [`<FieldLabel>`](file:///c:/Fred/Coding/SK/expo-app/components/FieldLabel.tsx), passing `help`. It renders the label, an info icon, and the explanation underneath. **This is the way to add any extra description to an input** — never a permanent paragraph of helper text above or below the field (confirmed as the general rule 2026-09-27, when the org Timezone field's note moved behind the icon). Added 2026-09-15 (U49) for a real conflict in admin forms: the copy that makes a field learnable is the copy that makes the screen unreadable once you have learned it. Three rules hold it together. **One durable preference, not one per field** — `showFieldHelp` in Settings (on by default) decides whether any help starts open; the per-field icon is deliberately **ephemeral**, lasting only while the screen is open. What a reader learns is *that the icon holds an explanation*, which is a fact about the app, not about one paragraph, and a form whose fields each remember a different answer is a form nobody can reason about. **The icon says how to put it away** — a merely *filled* icon does not tell anyone it can be pressed again, so while help is showing the control reads `ⓘ Hide`, and pressing removes only the word, leaving the icon exactly where it was. **The global switch is offered at the moment and the place of intent** — the first time anybody hides a field's help, a small prompt appears in the space the help just left, offering to hide it everywhere with two buttons and no third. It is deliberately **not a modal**: a blocking dialog is a heavy answer to a light act, and a dialog needing its own "do not show me this again" checkbox is usually one that should not have been blocking. Answering *is* the suppression — either reply records that the offer was made, and it is never shown again. Hover on web brings the text back in a bubble, suppressed while the help is already inline, and never the only way in. **The bubble is an ordinary absolutely-positioned view — do not reach for `<Modal>` here.** It was tried and it flickered several times a second: React Native Web's Modal is a focus-trapping dialog that appends a div to `document.body` on every mount and calls `focus()` on its content, which moved the page under the pointer, fired hover-out, unmounted it, and let hover-in fire again. **A dialog built to seize focus is the wrong primitive for something a mouse summons** — that is the line between this and `<OverflowMenu>`, where a modal is right precisely because a menu *should* take over. What the modal was there to solve turned out to be a **stale `zIndex`** on a neighbouring field, left from an inline dropdown that `CustomSelect` has since moved into its own modal; it protected nothing and only created a stacking context to lose to. The icon is still measured with `measureInWindow`, which is what lets the bubble **flip below** a label near the top of the window and **clamp** to the viewport instead of hanging off an edge. **The bubble starts at the label's left edge and runs right**, pulled back only at the window's right edge — not centred on the icon: the form sits in a scroll view, which clips what overflows it, so a centred bubble on a short label near the column's edge was cut off (2026-09-19). **On web the bubble is `position: 'fixed'`** (2026-09-30), so no card (`GlassCard` is `overflow-hidden`) or scroll view can clip it — both did, above the org Timezone label, the Playing step's *Sports*, and the first fields of the entrant modals. It measures its own height on an invisible first frame and flips below only when it does not fit above in the window. Native keeps the absolute bubble. Do not put a CSS `transform` on a container of a `<FieldLabel>` on web: it would become what `fixed` is measured against. **Before adding a `zIndex` to a form field, check that something still needs it** — `CustomSelect` and `DatePicker` both overlay through modals now, so wrappers around them generally do not. No `help` renders no icon: a self-evident field must not get one, or the icon stops meaning "there is more here" and becomes furniture. `UI-16` tracks the rollout. **Marking what can be left empty:** `optional` adds a quiet `Optional` after the label, `required` an orange `*`. Mark whichever is the exception on that form, never both — on the division screen the name fills itself in and the sport is always set, so the age group and the organisers are the ones labelled `Optional`.

*   **A password field**: Use [`<PasswordInput>`](file:///c:/Fred/Coding/SK/expo-app/components/PasswordInput.tsx), never a bare `TextInput secureTextEntry`. It is masked by default with an eye toggle inside the field, labelled "Show password"/"Hide password" for screen readers, and toggling never clears or submits the value. `purpose="current"` (sign-in) or `"new"` (choosing a password) sets `autoComplete`/`textContentType` so password managers fill or offer to generate correctly. Added 2026-09-19 and used by every password field: login, signup, reset-password and the change-password flow in Settings (which had its own hand-rolled toggle).

*   **The rarely-wanted actions on a screen**: Put them behind [`<OverflowMenu>`](file:///c:/Fred/Coding/SK/expo-app/components/OverflowMenu.tsx) in the header — a `⋯` control opening a modal sheet of items, each with an icon, an optional description, and a `destructive` flag that tints it red and rules it off from the rest. Added 2026-09-13 (U49) to get the event's danger zone out of the bottom of the tournament setup checklist: destructive actions belong to the *record*, not to one tab of it, and a set-up flow should not end on a red box offering to delete the thing being set up. **It is a modal, not a positioned popover, deliberately** — a header sits inside tab strips and scroll views, so an absolutely-positioned dropdown is clipped by whichever ancestor hides overflow on whichever platform; a modal has no ancestors, and the no-native-dialogs rule above already requires a custom overlay. It replaces the button only: the `<ConfirmationModal>` that actually protects the record still belongs to the screen.

*   **A person in an organisation**: [`PersonBits.tsx`](file:///c:/Fred/Coding/SK/expo-app/components/people/PersonBits.tsx) — `PersonAvatar` (photo placed by its image config, or the initial), `RoleBadge` (Staff and Admin only), `GuardianshipTag` (Minor or Dependant, from `guardianshipOf`) — and the org's members from [`useOrgMembers`](file:///c:/Fred/Coding/SK/expo-app/hooks/useOrgMembers.ts), which keeps them current from `org:{id}:members`. Added 2026-10-03 for the People list and person page ([people.md](file:///c:/Fred/Coding/SK/docs/people.md)); the team roster and anything else that lists people should use them rather than draw its own avatar or badge. Badge colours: [design_spec §1.1](file:///c:/Fred/Coding/SK/docs/design_spec.md).

*   **Saying when something is**: One home — [utils/dates.ts](file:///c:/Fred/Coding/SK/expo-app/utils/dates.ts) — and three kinds of "when", which are not the same job; the [date-formatting skill](file:///c:/Fred/Coding/SK/.agent/skills/date-formatting/SKILL.md) is the policy. An **instant** (a kick-off, "invited on") shows in the viewer's timezone: `formatFixtureWhen`, `formatInstant`, `formatInstantDate`. A **calendar date or range** (a birthday, an event, a league season) is the same day for everyone: `formatCalendarDate`, and `formatDateRange`, which collapses what the ends share (`19–21 Sep 2026`, not `19 Sep 2026 – 21 Sep 2026`), with `dateCountdown` adding how far off it is (`· in 6 days`). A **kick-off whose time is not set** is noon venue time with `timeTbd`, shown as the date and `TBD`. Forms convert between an instant and its date and time fields only through `instantToVenueInputs` / `venueInputsToInstant`, on the venue's clock (`venueTimeZone`), with `venueTimeHint` under the time field when that is not the device's; date fields are always `<DatePicker>`. Screens never format, parse or build dates themselves, and `npm run check:dates` enforces it — anything the file does not do yet is **added to it**. `date-fns` is not used (`UI-12`). It stays in `expo-app/utils/` because it reads the viewer's locale, timezone and "now"; the deterministic parts the server also needs are in `@sk/shared`'s `calendarDate.ts`.

*   **A section that opens and closes**: There is no shared component. `<AccordionHeader>` was added 2026-09-08 for the tournament Setup tab and deleted 2026-09-13 when U48 gave each setup step its own screen, taking its only consumer with it — and with it the `stickyHeaderIndices` flat-children constraint and the `position: sticky` web tree with descending z-indices that pinning a heading needed on two platforms. The sports editor's [`Collapsible`](file:///c:/Fred/Coding/SK/expo-app/components/admin/sports/editorPrimitives.tsx) is now the only one and is self-contained, which is what closed `UI-5`. **Before reaching for an accordion again, check the work is not really a screen**: the Setup tab reached six sections on a phone before that was obvious.

## Read-first record pages

Agreed 2026-10-01 while redesigning the org basic info screen ([docs/org-profile.md](file:///c:/Fred/Coding/SK/docs/org-profile.md)),
as rules to carry to other pages. So far they are applied to the org Profile, Settings and Nominate
admin pages, the People list and person page ([people.md](file:///c:/Fred/Coding/SK/docs/people.md)),
the Teams list and team page ([teams.md](file:///c:/Fred/Coding/SK/docs/teams.md)), the Sites list
and site page ([sites.md](file:///c:/Fred/Coding/SK/docs/sites.md)), and the Fixtures & Events list
and the tournament page ([events.md](file:///c:/Fred/Coding/SK/docs/events.md)); other pages adopt
them as they are next redesigned. The tournament page applies rule 12 at page scale: while a
tournament is being set up its first tab *is* the setup — numbered step cards that fold — and it
becomes the public Overview once the setup is done.

1.  **Read-first when a record is read more than it is edited.** Show values as text, one
    [`<ReadCard>`](file:///c:/Fred/Coding/SK/expo-app/components/ReadCard.tsx) per group. Each card's
    Edit opens an [`<EditDialog>`](file:///c:/Fred/Coding/SK/expo-app/components/EditDialog.tsx) —
    centred on a wide screen, a bottom sheet below 768px — that saves **only that card's fields**.
    No form on the page and no floating save bar. Closing a dialog with unsaved edits asks first,
    inside the dialog; a failed save keeps it open.
2.  **Show the value, not the options.** A single choice displays the chosen value. Its options
    appear only while editing: a segmented control for two to four options that change often, a
    dropdown for anything else.
3.  **Conditional fields appear only when their condition holds, next to what triggered them** —
    *Describe it* beside Type = Other, and nowhere else.
4.  **Lead with the record as others see it.** The most-read facts first, in their most
    recognisable form: logo, name and colours together.
5.  **An empty value says what is missing and offers the one action that fills it**
    (`ReadCardEmpty`). An empty card has no Edit link.
6.  **Orbitron is for display only** — screen titles, section labels, scores and clocks. Typed input,
    names and running text are Inter ([`TEXT_INPUT`](file:///c:/Fred/Coding/SK/expo-app/components/formStyles.ts)).
    A short code shown next to its name takes the name's font.
7.  **Cap the reading width**: about 960px for a profile, two columns when there is room; about
    720px for a settings page, which is one column of rows. Size inputs to their content.
8.  **One save behaviour per page, and it is visible.** A tap on a displayed value never starts a
    destructive action.
9.  **The same kind of data is entered the same way everywhere.** One address input
    ([`<AddressInput>`](file:///c:/Fred/Coding/SK/expo-app/components/address/AddressInput.tsx)), one
    colour input ([`<ColorPicker>`](file:///c:/Fred/Coding/SK/expo-app/components/ColorPicker.tsx), and
    [`<BrandColorsField>`](file:///c:/Fred/Coding/SK/expo-app/components/org/BrandColorsField.tsx) for an org's pair, used by Edit
    identity and both org create forms), one
    date input. A screen that needs something different improves the shared input instead of
    growing its own.
10. **Profile and settings are separate pages.** Profile is what the record is and how others see
    it. Settings is how it behaves: one card per setting or group, each saving itself — a switch
    saves when flipped (after a confirmation if it is far-reaching), anything else through its
    card's dialog.
11. **When a change makes two related values disagree, say so at that moment, and let the user
    decide.** Warn rather than block, and offer to bring the other value along when that is the
    likely wish — the org timezone after a new address pin.
12. **A temporary task gets a temporary place, and leaves completely when it is done.** Nominating an
    admin is a banner, an amber menu item and its own page, all gone once the org has an admin.
13. **Leave out a card that would be empty for most records**, rather than showing it empty; put its
    add action in the page's ⋯ menu. The person page shows Guardians only for a minor or someone
    with one, and the ScoreKeeper account card only while there is an invite to send.
14. **A list row and the record it opens say the same thing the same way** — the same badges, in the
    same order. Mark only what is not the default (no badge for Member).
15. **Several actions on one item inside a card go in one ⋯ menu on its row**, not a row of icons —
    each guardian on the person page: invite, make primary, edit, remove.
16. **When the right word depends on state, the label follows the state.** Never call someone
    something that is untrue of them: anyone with a guardian is treated as a minor, but the
    screens say **Minor** under the org's minor age and **Dependant** above it.
17. **Mark the exception, quietly.** On a form where most fields are required, the optional ones
    carry a small "Optional" after the label — sentence case, secondary colour, smaller and lighter
    than the label; where most are optional, the required ones carry an orange `*`. Never both on
    one form. This is `<FieldLabel>`'s `optional` and `required`, so a screen gets it by using
    FieldLabel.
18. **One search for a page made of lists**, covering every card on it, each card counting what
    matches ("1 of 22") and saying so in one line when nothing does. On a phone, where the cards
    are one long column, pin the search under the header with buttons that jump to each card —
    [`<JumpBar>`](file:///c:/Fred/Coding/SK/expo-app/components/JumpBar.tsx) with `useJumpSections`,
    which drops the buttons' counts, all of them, when any label would otherwise be cut. The team
    page: players, staff and games; the site page: facilities, location and coming up.
19. **An action that is not available stays in the menu, disabled, saying why** — Delete team
    "Not available: this team has 9 games. Deactivate it instead." — rather than vanishing.
20. **Work done in steps shows each step's state in one consistent way** (the tournament's *Setting
    up* tab, 2026-10-04). Three states — **Done** (green, a tick), **In progress** (amber), **Not
    started** (grey) — shown alike on the step's segment of a progress bar (one segment per step,
    with gaps, never one bar filling up), on its number and on its status pill. **No *Next*
    marker** (dropped 2026-10-05): numbered steps already give the order, and the first unfinished
    one starts open. A step that is used but unconfirmed — scoring on its default — is *In
    progress*, not *Not started*. What keeps a step from being done is **one warnings badge**
    ("⚠ 3 warnings") that opens a list, one warning a line, each linking to its fix — never a
    paragraph of gaps, which does not fit a phone.
21. **A page of many cards may fold them to one line each**, keeping the line's summary ("Where ·
    Main Campus · 5 facilities") so what was decided stays visible. Open the card the reader came
    for (the first unfinished step), fold the rest; a heading opens or closes its own card, several may be open,
    *Open all / Close all* sits above them, and what is open is remembered on the device. A folded
    card's Edit appears only when it is open, so a tap on the line never starts an edit.
22. **A choice with more options than fit on one line scrolls sideways, never wraps** — arrows on a
    wide screen (only while the options overflow), a swipe on a phone, the chosen option scrolled into view — with an **All N ▾**
    fixed at its end that lists every option for a quick jump (with a search once there are many).
    One choice at a time is shown under it: the tournament's sports, then the chosen sport's
    divisions. A segmented control is still the answer for two to four options (rule 2).

## NativeWind v4 & React Native Styling Constraints

To avoid dynamic runtime component upgrade warnings and navigation context serialization crashes:
*   **No Tailwind Pseudo-Classes**: Do not use `active:`, `hover:`, `focus:`, `group-hover:`, or `transition-all` on native components (`TouchableOpacity`, `Pressable`, `View`). Use native component props (`activeOpacity={0.8}`) or state-driven classes.
*   **No `truncate` on `<Text>`**: Use the native `numberOfLines={1}` prop on `<Text>` components instead.
*   **No CSS Ring Utilities**: Avoid `ring-2`, `ring-4`, or ring color classes; use standard `border-2 border-primary` or `border-4`.
*   **No CSS Sibling Spacing Utilities**: Avoid `space-x-*` or `space-y-*` on native views as sibling selectors (`> * + *`) force runtime component upgrades in NativeWind v4. Use native Flexbox gap properties (`gap-2`, `gap-4`, `gap-6`) instead.
*   **No Web Layout/Alignment Utility Classes**: Avoid `mx-auto`, `my-auto`, `sticky`, or unsupported shadow tiers (`shadow-2xl`, `shadow-xs`). Never inject `shadow-*` inside dynamic template strings (`${isActive ? 'shadow-sm' : ''}`), as dynamic shadow toggles force NativeWind to invoke `createAnimatedComponent` at runtime, crashing navigation context. Use static shadows or border/background state indicators instead.
*   **Animate with [`<AnimatedBox>`](file:///c:/Fred/Coding/SK/expo-app/components/AnimatedBox.tsx), never `Animated.View` directly**: a `className` on an `Animated.*` component does nothing — NativeWind's interop swaps components by *type* and no animated component is in its map, and `react-native-web` does not forward a raw `className` either, so the classes vanish on web and native alike with no warning. `AnimatedBox` puts the animation on the animated node and the classes on a plain `<View>` inside it; given neither `className` nor `innerStyle` it renders a bare animated node, so it also suits the inline-styled case where children must position against the animated node itself. That makes the rule exceptionless and greppable — a `<Animated.` anywhere outside `AnimatedBox.tsx` is a bug. Animate with React Native's `Animated` ([architecture.md](file:///c:/Fred/Coding/SK/okf/architecture.md) rule 2), not Reanimated and not NativeWind `transition-*`; a raw CSS `transition` shorthand in an inline style is not a `react-native-web` style property and silently does nothing. `useNativeDriver` must be `false` for anything driving layout (width, height, margins), and is moot on web, which has no native driver. `UI-7` records why `Animated.View` is deliberately **not** registered with `cssInterop` app-wide.
*   **Guard Web DOM Props**: Do not pass HTML5 web props (`onDragOver`, `onDrop`, `onDragStart`, `draggable`) to native components unless guarded by `Platform.OS === 'web'`.



