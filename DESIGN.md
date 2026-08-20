---
name: Threads Agent Console
description: Operator console for a Threads account that publishes on its own — built so the machine's state is read, not investigated.
colors:
  canvas: "#f6f7f9"
  surface: "#ffffff"
  surface-sunken: "#f1f3f6"
  ink: "#12161c"
  ink-secondary: "#525b6b"
  ink-faint: "#656e7c"
  ink-on-accent: "#ffffff"
  border: "#e3e6eb"
  border-strong: "#ccd2db"
  accent: "#2f54eb"
  accent-hover: "#2545cc"
  accent-soft: "#eef2ff"
  ok: "#067647"
  ok-soft: "#e7f6ef"
  warn: "#b54708"
  warn-soft: "#fdf3e7"
  danger: "#b42318"
  danger-soft: "#fdeceb"
  chart-line: "#2f54eb"
typography:
  stat:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'Noto Sans', sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "tabular-nums"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'Noto Sans', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.011em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'Noto Sans', sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.011em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'Noto Sans', sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
  ui:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'Noto Sans', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'Noto Sans', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.04em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "0.8125rem"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  full: "999px"
spacing:
  s-1: "0.25rem"
  s-2: "0.5rem"
  s-3: "0.75rem"
  s-4: "1rem"
  s-5: "1.25rem"
  s-6: "1.5rem"
  s-8: "2rem"
  s-10: "2.5rem"
  s-12: "3rem"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.375rem 0.6875rem"
    height: "2rem"
  button-hover:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink-on-accent}"
    rounded: "{rounded.sm}"
    padding: "0.375rem 0.6875rem"
    height: "2rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.ink-on-accent}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "0.375rem 0.5rem"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    rounded: "{rounded.sm}"
    padding: "0.375rem 0.6875rem"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.4375rem 0.625rem"
    typography: "{typography.ui}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
  panel-head:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    padding: "1rem 1.25rem"
    height: "3.25rem"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
    height: "2.25rem"
  nav-item-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  status-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.1875rem 0.5rem"
  status-chip-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
  status-chip-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
---

# Design System: Threads Agent Console

## Overview

**Creative North Star: "The Duty Officer's Desk"**

One person supervises a machine that speaks in their name while they are not
looking. Everything on this surface exists so that supervision costs seconds,
not investigation: the state of the machine is printed, not discoverable, and
the one thing that can go wrong quietly — nothing queued for tomorrow — is the
loudest object on the screen.

The visual world is the operational-console convention, chosen deliberately
over more expressive alternatives and executed straight, at the craft level of
Stripe's dashboard. That means no irony and no smuggled quirk: a navigation
rail, a row of stat tiles, dense list panels, hairline rules. What separates it
from a template is discipline rather than invention — every number carries the
context that makes it actionable, colour is spent only where state is genuinely
at stake, and the surface refuses to print a figure it does not have.

Density is high and deliberate. Chrome sits at 14px, content at 15px, and the
only large type on the page is a measured quantity. There is no illustration,
no gradient, no glass. Depth is one hairline border and one small shadow; when
something needs to stand out it does so by being the only coloured thing in
view.

**Key Characteristics:**

- Neutral canvas, one indigo accent, semantic hue reserved for real state
- Tabular figures on every number, without exception
- Hairline borders as the primary separator; shadow used sparingly and softly
- Authored 16px SVG icons on one 24-grid at 1.7 stroke — no icon dependency
- Absence is a designed state, never a blank or a zero
- Ukrainian throughout, including every status, error and empty state

## Colors

A cool neutral field with a single indigo voice, plus three semantic hues that
appear only when something is true about the system.

### Primary

- **Signal Indigo** (`#2f54eb`): the one accent. Primary buttons, links, the
  active navigation item, and the single hue every chart line is drawn in.
  Deepens to `#2545cc` on hover. In dark it lightens to `#8b9bff` — the role
  is identical, the value is not.

### Neutral

- **Console Canvas** (`#f6f7f9`): the page ground. Cool rather than warm, so
  white panels read as raised without needing a shadow to say so.
- **Panel White** (`#ffffff`): every panel, tile, control and row surface.
- **Sunken** (`#f1f3f6`): pressed states, code spans, scope chips, the ground
  under a nested list.
- **Ink** (`#12161c`): body and all primary text.
- **Ink Secondary** (`#525b6b`): supporting prose and list bodies.
- **Ink Faint** (`#656e7c`): column heads, timestamps, meta lines, placeholder.
- **Hairline** (`#e3e6eb`) and **Hairline Strong** (`#ccd2db`): dividers and
  control strokes respectively.

### Semantic

- **Steady Green** (`#067647`): a metric that moved up. Nothing else.
- **Attention Amber** (`#b54708`) on **Amber Wash** (`#fdf3e7`): the unfed slot,
  a token inside two weeks of expiry, a metric that moved down.
- **Failure Red** (`#b42318`) on **Red Wash** (`#fdeceb`): a failed publish, a
  missing permission, an invalid token, a guardrail violation.

### Named Rules

**The Reserved Colour Rule.** Semantic hue never decorates. A chip, a row or a
figure is amber or red only when acting on it is the correct response. A row of
permanently coloured chips teaches the eye to ignore colour, which is the one
thing a supervision surface cannot afford.

**The One Alarm Rule.** When several instances of the same problem are visible
at once — four unfed slots, say — exactly one is emphasised: the nearest. The
rest state their condition quietly. Four identical amber rows are wallpaper.

**The Faint Tier Is Text Rule.** `ink-faint` carries real content (slot times,
column heads, placeholders), so it is held at or above 4.5:1 against every
ground it lands on — surface, canvas, sunken, and all three washes — not merely
against white.

## Typography

**Display / Body / Label Font:** the platform system stack
(`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, …`)
**Mono Font:** `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas`

**Character:** deliberately voiceless. This is an Operate surface for one
reader on two devices behind a home tunnel; a webfont would buy personality at
the cost of a render-blocking request over a link that is sometimes slow and
sometimes off. The personality lives in the numbers and the spacing.

### Hierarchy

- **Stat** (600, 2rem, 1.1, -0.02em, tabular): the measured quantity in a tile.
  The only large type on the surface.
- **Headline** (600, 1.25rem, 1.3): a settings field's value, a gate title.
- **Title** (600, 1.0625rem, 1.25): the view name in the sticky bar.
- **Panel heading** (600, 0.875rem): every `<h2>`. Deliberately close to body
  size — a panel title is a label, not an announcement.
- **Body** (400, 0.9375rem, 1.55): post text, draft text, composer input.
  Capped at 68ch everywhere it appears.
- **UI** (400, 0.875rem): controls, inputs, list rows.
- **Base** (400, 0.8125rem): dense list metadata and button labels.
- **Label** (600, 0.75rem, 0.04em, uppercase): tile and field column heads.
- **Tiny** (400, 0.75rem): timestamps, token counts, provenance lines.

### Named Rules

**The Tabular Rule.** Every number on this surface is compared to another
number — across rows, across days, across tiles. `font-variant-numeric:
tabular-nums` applies to `.num` and to every `time` element, and a new numeric
readout that forgets it is a defect, not a nit.

**The Measure Rule.** Prose inside a panel is capped at 68ch even when the
panel is 1100px wide. A full-width line of explanatory text is the classic
dashboard tell that nobody read the page back.

## Layout

A two-part shell: a 15rem navigation rail and a content column capped at 76rem.
Below 60rem the rail is replaced by a fixed four-item bottom bar, and the
content column takes the full width.

The sticky bar is 3.5rem tall, translucent over the canvas with a 12px
backdrop blur, and holds the view name, the three standing facts, and one
refresh control that reloads exactly what the current screen shows.

Panels are the only container. They never nest: a panel holds a head, a body or
a list, and optionally a foot — never another panel. Panel padding is `s-5`
horizontally, `s-4`–`s-5` vertically; list rows inside a panel drop to `s-3`.

Spacing runs on a 4px grid from `s-1` to `s-12`. Views separate their panels by
`s-6`; a panel separates its own parts by `s-4`. More space sits above a
heading than below it.

Breakpoints are few and load-bearing: **32rem** (the quota chip and field
labels leave the status bar), **44rem** (slot rows lose their fixed time
column), **48rem** (a post's curve moves under its row), **60rem** (rail
replaces bottom bar), **66rem** (Content and Settings become two columns).

Stat tiles use `repeat(auto-fit, minmax(10rem, 1fr))`, which yields four across
on a desktop and two across on a phone; one tile per row on a phone would push
the slots below the fold, and the slots are the reason the screen exists.

## Elevation & Depth

Near-flat by design. Depth comes from a hairline border plus a very small
ambient shadow; the border does the work and the shadow only keeps a white
panel from dissolving into a white-adjacent canvas.

### Shadow Vocabulary

- **Resting** (`0 1px 2px rgb(16 22 28 / 0.06), 0 1px 1px rgb(16 22 28 / 0.04)`):
  every panel and tile.
- **Lifted** (`0 1px 3px rgb(16 22 28 / 0.07), 0 10px 28px -12px rgb(16 22 28 / 0.16)`):
  the offline card and the access gate — the two moments the page has one
  subject.
- **Overlay** (`0 2px 6px rgb(16 22 28 / 0.08), 0 24px 48px -20px rgb(16 22 28 / 0.24)`):
  reserved; nothing currently floats.

In dark, shadows deepen to near-black and the border carries proportionally
more of the separation, because a soft shadow over `#0c0e12` is invisible.

### Named Rules

**The Border-First Rule.** If a surface needs to separate from what is behind
it, add a hairline before reaching for a shadow. Every shadow in this system
carries both an offset and a soft blur; a zero-offset halo is decoration and
does not belong here.

## Shapes

Rounded but restrained: `4px` on inline code chips only, `6px` on controls,
chips and inputs, `12px` on panels and tiles, `999px` only on the avatar and
the small circular slot marker. No squircles, no asymmetric corners, no
clipping tricks.

The `4px` step exists for one reason: an inline code span wraps 0.9em text, and
at the control radius it reads bloated against the line it sits in. It is not a
general small-radius token — nothing else in the system may use it.

Borders are 1px everywhere. A coloured left border is not part of this
language — a state-bearing row is tinted across its whole ground (see the
unfed slot) rather than flagged at one edge.

## Components

### Buttons

- **Shape:** `6px`, minimum height `2rem`, icon and label separated by `s-2`.
- **Default:** white on a `border-strong` stroke; hovers to sunken with the
  stroke darkening to `ink-faint`.
- **Primary:** accent ground, `ink-on-accent` label; hovers to `accent-hover`.
  One primary per panel — the action that panel exists for.
- **Quiet:** transparent, `ink-secondary` label, tighter inline padding. Used
  for repeat/refresh actions and the disclosure rows in generation history.
- **Danger:** white ground, `danger` label, stroke mixed 32% toward danger;
  hovers onto `danger-soft`. Delete confirms in place by relabelling itself
  rather than opening a dialog.
- **Focus:** the global 2px accent outline at 2px offset, never a replacement
  of the border.

### Panels

- **Corner:** `12px`. **Background:** `surface`. **Border:** 1px hairline.
  **Shadow:** Resting. **Padding:** `s-5` body, `s-4 s-5` head.
- A head is a flex row: `<h2>`, then anything else pushed right by `.spread`.
- A list inside a panel separates rows with a hairline on `border-block-start`,
  suppressed on the first row so it does not double the head's border.

### Inputs and text areas

- White ground, `border-strong` stroke, `6px`, `0.4375rem 0.625rem` padding.
- **Focus:** the border becomes accent and a 3px 18% accent ring appears; the
  outline is suppressed because the ring is the affordance.
- Text areas use `field-sizing: content` with a `5lh` floor, so a draft grows
  with its text instead of scrolling inside a fixed box.
- Labels sit above their control at 0.75rem/600 in `ink-secondary`.

### Navigation

- **Rail:** account identity at the top, four items, the configured slots and
  daily cap as a foot note. An item is `ink-secondary` at rest and, when
  active, `accent` on `accent-soft` at weight 600, with `aria-current="page"`.
- **Bottom bar (below 60rem):** the same four items as icon-over-label, fixed,
  translucent with a blur, padded for the safe-area inset. Active is accent
  colour only — no pill, no indicator bar.
- Selection is carried in `location.hash`; a hash naming no view leaves the
  current one alone.

### Stat tile

The signature component. Column head, measured quantity, then whatever context
that specific metric can honestly supply — a delta against an equal preceding
period, «з нуля» when the baseline was zero, a named absence when the API
returns no comparable period, and a sparkline only where the API returns a
daily series. Today exactly one of the four (profile views) earns a curve;
`likes`, `replies` and `followers_count` come back as aggregates, so they carry
context in words instead. While a value is loading the number is replaced by a
shimmering block of its own width, not by a zero.

### Slot strip

The other signature component, and the page's focal moment. Upcoming
publishing slots resolved in the account's timezone, each either carrying its
queued text or standing empty. The first empty slot is tinted `warn-soft`,
states plainly that the account will say nothing, and holds the only primary
action on the screen. Later empty slots read a quiet «порожньо».

### Status chips

Three readouts — quota, token days, permissions — in the sticky bar. Neutral by
default; a chip adopts amber or red only when its fact warrants action, and
picks up a small icon at the same moment. Below 32rem the labels and the quota
chip drop away, leaving the two facts that can actually be wrong.

## Do's and Don'ts

### Do:

- **Do** apply `.num` (or use a `time` element) to every figure, so columns of
  numbers align and a changing value does not shift its neighbours.
- **Do** state an absence in words. «Жодного знятого показника» plus the action
  that fixes it beats a zero, and a zero that means "unmeasured" is a lie.
- **Do** cap prose at 68ch inside a panel, however wide the panel is.
- **Do** give an error both the problem and the recovery in the same sentence,
  in Ukrainian, and put a blocked capability in `ink-faint` as a fact about the
  app's access level rather than in red as a session failure.
- **Do** route every enum that reaches the screen through a Ukrainian label map
  before rendering it.
- **Do** keep one primary button per panel, on the action that panel exists for.
- **Do** define a colour in the base `:root` block and only re-point it in the
  dark block, so no component ever branches on theme.

### Don't:

- **Don't** nest a panel inside a panel. If content needs its own frame, it
  needs its own panel beside the first.
- **Don't** spend semantic colour on anything that is not a state worth acting
  on, and don't leave a chip permanently coloured.
- **Don't** emphasise more than one instance of the same problem at once.
- **Don't** draw a sparkline from fewer than two readings, or a percentage
  delta against a zero baseline.
- **Don't** add a webfont, an icon package, or an emoji standing in for an
  icon; icons are authored SVG in `AppIcon.vue` on one grid and one stroke.
- **Don't** use a coloured left border to flag a row's state — tint the row.
- **Don't** introduce a second path to publish or delete. Both actions are
  explicit, singular, and already have their control.
