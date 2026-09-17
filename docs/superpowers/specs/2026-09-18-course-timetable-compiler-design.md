# Course timetable → room schedule compiler (design)

Status: approved by user 2026-09-18. Covers sub-project (B) from the Nexus
spec — deriving per-room aircon schedules from the school's real course
timetable. Sub-projects (A) (protocol v2 + firmware) and (C) (app UI update)
build on this but are designed separately.

## Background

The system (project name "Nexus") monitors aircon usage across the Bosco
Building (Years 7-9 only) via one microbit per room, broadcast UDP from a
phone app. Previously the app's Excel input directly encoded per-room
on/off windows. That's now replaced: the app imports the school's **real**
course timetable (subject per class per period) and **derives** each room's
aircon schedule from it — nobody hand-types on/off windows anymore.

A real sample workbook was obtained (Google Sheets export, `samples/timetable_raw.xlsx`)
and inspected directly to ground this design. Key findings:

- Sheet `7-9` holds the authoritative per-class timetable: one 9-row block
  per class (`Year 7A`, `Year 7B`, ... `Year 9C`), each block being a
  title row, semester row, class-name row, a period-time header row, and 5
  day rows (Monday-Friday).
- Columns B, E, H, K in each block are constant labels (`Homeroom`,
  `Break`, `Lunch`, `Snack`) merged vertically across all 5 day rows — not
  real subjects, and column B has no time header at all (ignore it).
- The 7 real teaching periods are columns C, D, F, G, I, J, L, with a
  header row giving each one's `H.MM-H.MM` time range (dot-separated,
  needs converting to the app's `HHMM` format).
- Double periods are represented as **merged cells** (e.g. `F5:G5` for a
  10:00-11:40 double period) — reading the sheet without resolving merges
  first is exactly why the user saw `undefined` for two-period courses.
  The fix is to resolve every merge (copy the top-left cell's value across
  the whole merged range) before converting rows to JSON.
- Sheets `Thai` and `Foreign` are **per-teacher** schedules, not per-room.
  Year 10-12 entries carry an explicit room number; Year 7-9 entries never
  do, even for `Project` periods. They contain no room information this
  compiler needs and are not used as an input.
- Sheet `Room` is Year 10-12 room bookings — out of scope for the Bosco
  Building (Years 7-9 only), except for a "คาบ MI Modules" section, which
  is explicitly skipped per the M.I. rule below anyway.
- Sheet `7-9 (2)` is a near-duplicate of `7-9` with one real discrepancy
  (Year 7A, Thursday/Friday, one period — "Grammar"/"Computer" swapped).
  The user confirmed there should be only one canonical version; `7-9` is
  treated as authoritative. This discrepancy should be manually fixed at
  the source; the compiler does not attempt to reconcile it.

## Subject → room mapping rules

For each (class, day, period-range, subject) cell resolved from
`CourseTimetable`:

| Subject | Destination room | Home classroom during this period |
|---|---|---|
| `PE` | none (untracked) | vacated (off) |
| `Project` | `CCLab` (default; overridable per class via `RoomMappingRules`) | vacated (off) |
| `Art` | `CCArt` (always, not overridable) | vacated (off) |
| `Computer` | `CCComputer` (always, not overridable) | vacated (off) |
| `Social Studies` / `สังคมศึกษา`, **only for classes 8A-8D** | `CCMultimedia` | vacated (off) |
| `Music` | none (untracked) | vacated (off) |
| `MI` / `M.I.` (any case/spacing) | **skipped entirely** | **untouched** — no override generated in either direction |
| everything else | home classroom (`CC` + class code) | occupied (on, per that room's default hours) |

"Vacated" means: emit an aircon-off override for the home classroom's own
room for that exact time window. "Destination room" (when tracked) means:
emit an aircon-on window for that special room covering that exact time
window, merged with adjacent/identical windows from other classes using
the same room at overlapping or adjacent times.

Matching subject text is case-insensitive and trims whitespace/newlines;
Thai and English subject names are matched as literal alternates (e.g.
`Social Studies` and `สังคมศึกษา` both trigger the same rule).

`RoomMappingRules` sheet lets a specific class override the default
`Project → CCLab` mapping (e.g. one class's Project always meets in
`CCRobotics` instead). No other subject in the table above is overridable
via this sheet — Art/Computer are fixed, PE/Music/M.I. are fixed
no-ops, and Social Studies' 8A-8D-only Multimedia rule is fixed logic
(not data-driven), matching what the user specified.

## Room list (confirmed)

13 special (non-regular) rooms: `CCComputer`, `CCMakerspace`, `CCLab`,
`CCSmartBoard`, `CCAcedemic`, `CCActivity`, `CCRobotics`, `CCPhotography`,
`CCMultimedia`, `CCArt`, `CCPresentation`, `CCLibrary`, `CCDrama`.

Regular rooms: `CC7A`-`CC7D`, `CC8A`-`CC8D`, `CC9A`-`CC9C` (11 classes,
one homeroom each). A room with no subject ever mapped to it (e.g.
`CCMakerspace`, `CCRobotics` unless overridden via `RoomMappingRules`) has
an empty derived weekly schedule — it can still get aircon-on windows via
the `SpecialEvents` sheet for one-off bookings.

## Excel schema (5 sheets)

1. **CourseTimetable** — the school's raw export format, parsed directly
   (see Background). Not hand-authored; re-exported from the school's
   system each term/semester.
2. **RoomMappingRules** — columns `ClassCode` (a class code like `8A`, or
   `ALL`), `Subject` (currently only `Project` is meaningful), `RoomCode`.
   A class-specific row overrides the `ALL`/default row for that subject.
3. **SpecialEvents** — one-off overrides layered on top of the derived
   weekly schedule. Columns: `RoomCode` (or `ALL`), `Date` (`YYYYMMDD`),
   `StartTime`, `EndTime`, `Enabled` (`Y`/`N`), optional `EventName` for
   humans. (Same shape as the existing `Events` sheet from the prior
   design — carried forward unchanged.)
4. **Trackers** — unchanged from the existing design: `RoomCode`,
   `ChatID`, optional `Label`.
5. **Holidays** — new. Columns: `StartDate` (`YYYYMMDD`), `EndDate`
   (`YYYYMMDD`), optional `Label`. Applies building-wide (every room);
   during a holiday range, aircon should never be scheduled on, overriding
   everything else.

## Compiler pipeline

```
CourseTimetable (raw grid)
  -> resolve merged cells
  -> per class block: extract (day, period-column, time-range, subject)
  -> drop non-teaching columns/values (Homeroom label column, Break/Lunch/Snack, blank cells)
  -> drop M.I. entirely
  -> map subject -> destination (home room occupied, or vacated + destination room occupied)
  -> merge adjacent/overlapping same-destination windows per room per day
  -> RoomSchedule[] weekly section (same shape the existing buildRoomSchedules() already produces)
  -> layered with RoomMappingRules overrides, SpecialEvents, Holidays, Trackers (existing sheets/logic)
```

The output shape is unchanged from the existing `RoomSchedule` type
(`weekly`, `events`, `trackers`) plus a new `holidays` field — everything
downstream (packet building, dashboard, app UI) keeps working against the
same interface, just with `weekly` now *derived* instead of hand-entered,
and one new top-level field.

## Wire protocol v2 (affects sub-project A, noted here since schema output feeds it)

Regular and special rooms diverge in packet shape again (reverting the
prior session's "always send WD1-WD7" simplification, which turns out to
be wrong for this real system):

- **Special room**: `WD1..WD7` always present (bare marker if empty) —
  full explicit weekly schedule, as before.
- **Regular room**: only the `WD<n>` markers for days that have at least
  one override window are present; other days are omitted entirely. The
  firmware falls back to its own hardcoded default (08:00-11:40,
  12:30-16:20) for any omitted day. Override windows can carry an
  explicit `Y`/`N` flag (usually `N`, to force off during a vacate
  window).
- New `H` (Holiday) section: bare `H` marker followed by one or more
  `YYYYMMDD-YYYYMMDD` range tokens (17 chars each), terminated by the next
  section marker. Applies identically to every room (holidays are
  building-wide).
- `E` (Events) section becomes a **bare `E` marker** (no numeric ID)
  followed by repeating `(date, slot+)` groups — a date token (8 digits)
  starts a new day's group; subsequent 9/10-char tokens are that day's
  windows, until the next date token, `H`, or `T` marker.

This changes both the app-side packet builder and the firmware parser
(`parseChart()`); both will be rewritten together in sub-project A so they
stay in lockstep, since both ends are ours to define this time.

## Explicitly out of scope for this spec

- Sub-project A (firmware rewrite, protocol builder rewrite) — separate
  design/implementation pass, referenced above only where it constrains
  this compiler's output shape.
- Sub-project C (app UI changes to show holidays/room-mapping-rules,
  editing derived schedules) — follows once (B)'s output shape is final.
- Fixing the `7-9` vs `7-9 (2)` Grammar/Computer discrepancy at the
  source — flagged to the user, not the compiler's job to guess which is
  right.
