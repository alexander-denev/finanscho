# Design plan

Finanscho should feel like a well-kept paper ledger: calm, precise, and quietly confident. Numbers
are the primary content. The interface recedes; amounts line up.

## Principles

1. **Ledger, not dashboard-in-a-box.** Content sits on the page, separated by hairline rules, not
   boxed into identical floating cards with grey shadows. Shadows appear only on things that truly
   float (dialogs, the add button, toasts).
2. **Numbers first.** Amounts use tabular figures, right alignment in lists, and a slightly heavier
   weight than their labels. Signs are always explicit (`+` / `−`) and paired with a word or icon,
   so meaning never depends on color alone.
3. **Serif for structure, sans for work.** Page titles and section headings use a book serif to
   give the ledger character; everything interactive uses the system sans for legibility.
4. **Quiet color.** One deep "pine" for actions and focus of attention, one "brass" accent used
   sparingly (focus rings, the current tab marker). Moss and brick carry income and expense.
   No gradients, no all-caps eyebrow labels.
5. **Touch-friendly.** Tap targets ≥ 44 × 44 px; safe-area insets respected on phones.

## Palette

Six named colors, each with a light and a dark variant. Dark mode is a deep green-black "night
ledger", not an inverted grey. Contrast pairs were checked against WCAG AA (≥ 4.5:1 for body text on
Paper and Raised in both themes).

| Name      | Role                                   | Light     | Dark      |
| --------- | -------------------------------------- | --------- | --------- |
| **Paper** | page background                        | `#F6F3EC` | `#111614` |
| **Ink**   | primary text                           | `#1B2420` | `#E8E5DC` |
| **Pine**  | primary actions, links, active state   | `#1F4A45` | `#86C9BB` |
| **Brass** | accent: focus ring, current-tab marker | `#8A5E12` | `#E2B45C` |
| **Moss**  | income, positive amounts, under budget | `#2E6634` | `#8FCB93` |
| **Brick** | expense emphasis, over budget, errors  | `#A0372A` | `#F2917F` |

Supporting neutrals derived from Paper and Ink:

| Token         | Light     | Dark      | Use                                 |
| ------------- | --------- | --------- | ----------------------------------- |
| `--c-raised`  | `#FFFDF8` | `#18201D` | inputs, dialogs, the nav surface    |
| `--c-sunken`  | `#EDE8DC` | `#0C100E` | progress track, pressed states      |
| `--c-rule`    | `#D9D1C0` | `#2B3531` | hairline separators, input borders  |
| `--c-muted`   | `#5B645F` | `#A1ACA6` | secondary text (AA on Paper/Raised) |
| `--c-on-pine` | `#FFFFFF` | `#0D1A17` | text on Pine buttons                |
| `--c-near`    | `#8A5E12` | `#E2B45C` | budget "near limit" (Brass)         |

Swatches (account and category colors, chosen by the user) have their own light/dark pairs:
teal, blue, plum, amber, rust, olive, rose, slate. They are used only as small dots/bars, never as
text color, so they need 3:1 against the background, not 4.5:1.

## Typography

- **Headings (serif)**: `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua",
Georgia, serif`. System fonts only — no web fonts, so the app renders instantly and offline.
- **UI and body (sans)**: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial,
sans-serif`.
- **Numbers**: the sans stack with `font-variant-numeric: tabular-nums` everywhere amounts appear.

Type scale (minor third, 1.2, base 16 px):

| Token      | Size  | Use                              |
| ---------- | ----- | -------------------------------- |
| `--fs-xs`  | 12 px | captions, badges                 |
| `--fs-sm`  | 14 px | secondary text, labels           |
| `--fs-md`  | 16 px | body, inputs (prevents iOS zoom) |
| `--fs-lg`  | 19 px | list amounts, card titles        |
| `--fs-xl`  | 23 px | section headings                 |
| `--fs-2xl` | 28 px | page titles                      |
| `--fs-3xl` | 34 px | the dashboard's headline total   |

Line heights: 1.25 for headings and numbers, 1.5 for body text. Weights: 400 body, 600 amounts and
emphasis, 500 serif headings.

## Spacing scale (4 px base)

`--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 · `--sp-5` 24 · `--sp-6` 32 · `--sp-7` 48 ·
`--sp-8` 64 px. The mobile side gutter is `--sp-4`; the desktop content column is capped at
`--content-max` (44 rem) for comfortable reading.

## Radius scale

`--r-sm` 4 px (inputs, buttons) · `--r-md` 8 px (swatches, progress bars, list highlights) ·
`--r-lg` 14 px (dialogs, sheets, toasts) · `--r-pill` 999 px (badges, the add button).

## Elevation and motion

- `--shadow-float`: a single soft shadow for dialogs, the floating add button, and toasts.
- Transitions are 120–180 ms ease-out on color and opacity only; all motion is disabled under
  `prefers-reduced-motion: reduce`.

## Layout

- **< 768 px**: single column, bottom tab bar (Dashboard, Transactions, Budgets, Accounts, More)
  with a floating round "Add transaction" button above it, bottom safe-area padding.
- **768–1023 px**: same as mobile with wider gutters.
- **≥ 1024 px**: persistent left sidebar (all sections, sync status, "Add transaction" button),
  content column capped at `--content-max`.
- Switching is done with CSS media queries only.

## Components

- **Lists** are ledgers: rows separated by `--c-rule` hairlines, the amount right-aligned in
  tabular figures, the category as a small colored dot plus name. Days are grouped under a small
  serif date heading with the day's net on the right.
- **Amounts**: expense `−€12.30` in Ink with a "Expense" visually-hidden label; income `+€2,500.00`
  in Moss with a visible `+`; transfers use a neutral arrow glyph and Muted color.
- **Progress bars**: a 6 px Sunken track with a Moss (under), Brass (near), or Brick (over) fill;
  the status is also written in text ("€40.00 left", "€12.00 over").
- **Buttons**: primary = Pine fill; secondary = Raised with a Rule border; danger = Brick text.
- **Focus**: a 2 px Brass outline with 2 px offset on every interactive element.
- **Empty states**: a serif sentence telling the user what to do, and one primary button.
