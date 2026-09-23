# The profile code

Version 3. Implemented in `app/lib/codec.js`, tested in `test/codec.test.mjs`.

The code is base64url (`A-Z a-z 0-9 - _`, no padding) of these bytes:

| Bytes | Content |
|---|---|
| 1 | version, `0x03` |
| 1 | flags: bit 0 = remote work is fine; bits 1-3 = posted within (0 any time, 1 = a day, 2 = 3 days, 3 = 7 days, 4 = 30 days, 5 = 90 days) |
| 8 | families (ISCO-08 unit groups), one bit per position in `catalogues/families.json` |
| 1 | level (2 bits: any, junior, mid, senior) · years cap index (3 bits: none, 1, 2, 3, 5, 7, 10, 15) · highest degree (2 bits: none, bachelor, master, phd) |
| 2 | languages, one bit per position in `catalogues/languages.json` |
| 4 | degrees held, one bit per position in `catalogues/degrees.json` |
| varint n, then n varints | countries as positions in `catalogues/countries.json`, in the visitor's order of preference |
| varint n, then n strings | role words (each: varint length + UTF-8, at most 24 bytes; at most 8) |
| varint n, then n varints | deal-breaker chips as positions in `catalogues/vetoes.json` |
| varint n, then n strings | deal-breaker words, as the role words |
| varint n, then n varints | specialties: ESCO occupations as positions in `catalogues/occupations.json` (each brings its family, the first four digits of its code) |
| varint, then the place | a town and a distance: its country's position in `catalogues/countries.json` plus one (0 = no town, and nothing follows), its name (UTF-8, at most 60 bytes), latitude and longitude in hundredths of a degree (two signed 16-bit numbers, big-endian), and the distance's step (one byte: 5, 10, 25, 50 or 100 km). The town's country joins the countries. |
| 2 | CRC-16/CCITT-FALSE of everything before, big-endian |

Bitfields: position p of the catalogue is bit (p mod 8) of byte (p div 8); a position past the
field is left out of the code.

Sizes: an empty profile is 34 characters; a typical one 55 to 150; everything at once stays
under 450.

Rules that keep old codes meaningful: catalogues are append-only and never reordered; an
id unknown to the encoder is left out; a bit set for a position the decoder's catalogue
does not have yet is ignored. A change of layout is a new version byte.

## History

- **Version 3 (2026-09-22).** Specialties inside the families (ESCO's occupations, so a visitor
  can keep only naval architects among the mechanical engineers), a town and a distance around
  it (the town travels with its coordinates, so a bookmark does not depend on the day's pile),
  and posted windows of a day, three days and ninety days (the field grew to three bits). A
  version-2 code is read as before: its posted field is two bits of 0, 7 and 30 days, and it
  has no specialties and no town.
- **Version 2 (2026-09-05).** Families became the ISCO-08 unit groups of the vertical (37 of
  them, grouped as engineers, architects/planners/surveyors, technicians, supervisors, plant
  operators, ship and aircraft crews), so the family field grew from 4 to 8 bytes. A
  version-1 code named families that no longer exist; the decoder refuses it with the
  message to make a new one.
- **Version 1 (2026-09-04).** 19 hand-made families in a 4-byte field.
