# SportGo — brand

## The mark: "Ascent"

Three bars, stacked and stepping forward as they climb. Read one way it is a
signal-strength meter — speed, connection, data. Read another it is a stadium
tier seen in section, or a set of strides. All three readings are about
momentum, which is the single idea the mark carries.

It is not a ball, a swoosh, a laurel, a die, a chip or a card. Nothing in the
mark should read as casino.

### Construction

One module governs everything: a **5-unit bar height on a 32-unit field**.

| Property | Value |
|---|---|
| Bar length | 11 units |
| Bar height | 5 units |
| Horizontal step | 4.5 units (each bar sits further back) |
| Vertical step | 8.5 units |
| Lean | 1 unit of run over 5 units of rise — 11.31°, applied identically to both ends of every bar |

The lean is baked into the path coordinates rather than applied as an SVG
`transform`. That keeps the gradient in the same untransformed user space as
the geometry, and lets `public/logo.svg` and `public/favicon.svg` reuse the
path data from `LogoMark.tsx` verbatim instead of re-deriving it — the mark
cannot drift between the component and the static assets.

### Colour

The brand tone runs a two-stop linear gradient **along the axis of motion**:
brightest at the leading bar, deeper at the trailing one, so the mark reads as
travelling rather than merely tilted.

| Stop | Token | Value |
|---|---|---|
| 0 (lead bar) | `--color-primary` | `#f5c518` |
| 1 (trail bar) | `--color-primary-active` | `#d9ab08` |
| Ground (favicon) | `--color-canvas` | `#070707` |

Two flat tones exist for constrained contexts: `mono` (inherits `currentColor`,
for use beside text) and `inverse` (`--color-ink-inverse`, for placing the mark
on a primary or otherwise light fill).

## The lockup

Mark + wordmark, set in Inter at **650 weight** with `-0.02em` tracking.

**"Sport" in `--color-ink`, "Go" in `--color-primary".** One differentiation,
carrying one idea: *Go* is the verb, and it is the half that moves. Resist
adding a third colour — the restraint is the point.

The mark's optical baseline aligns to the wordmark's baseline, not to the
bounding box. The bars lean forward, so a box-aligned lockup reads as tipping.

### Clear space

Equal to **four bar heights (20 units at the mark's own scale)** on every side.
Nothing — no text, no rule, no other mark — enters that zone.

### Minimum sizes

| Context | Minimum |
|---|---|
| Mark alone | 16 px |
| Full lockup | 96 px wide |

Below 16 px the 1-unit lean stops resolving and the mark reads as three plain
bars. Use the mark alone at that size, never the lockup.

## Do not

- Recolour the mark outside the three defined tones.
- Outline it, add a stroke, or knock it out of a photograph.
- Stretch, skew, rotate or re-space the bars.
- Add a drop shadow, glow, bevel or reflection.
- Put the brand-tone gradient on a light background — use `mono` or `inverse`.
- Set the wordmark in any weight other than 650, or in a different family.
- Place the lockup on a busy image without a solid plate behind it.

## Placeholder crests

`TeamCrest` and `CompetitionCrest` generate artwork rather than loading a real
club badge or league logo — those are third-party marks and using them would be
a licensing problem, not a design choice.

Both derive a hue deterministically from the entity's name, so a club keeps the
same colour across rebuilds and sessions. `TeamCrest` uses a shield-like
rounded form; `CompetitionCrest` uses a rounded square with a diagonal cut, so
the two never read as the same object. Both are always `aria-hidden` — the name
is present in adjacent text, and a decorative monogram announced by a screen
reader is noise.

When a licence-cleared asset does become available, pass it as `src` and the
component renders the real image instead. No other code changes.
