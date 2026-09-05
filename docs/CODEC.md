# The profile code

Version 2. Implemented in `app/lib/codec.js`, tested in `test/codec.test.mjs`.

The code is base64url (`A-Z a-z 0-9 - _`, no padding) of these bytes:

| Bytes | Content |
|---|---|
| 1 | version, `0x02` |
| 1 | flags: bit 0 = remote work is fine |
| 8 | families (ISCO-08 unit groups), one bit per position in `catalogues/families.json` |
| 1 | level (2 bits: any, junior, mid, senior) · years cap index (3 bits: none, 1, 2, 3, 5, 7, 10, 15) · highest degree (2 bits: none, bachelor, master, phd) |
| 2 | languages, one bit per position in `catalogues/languages.json` |
| 4 | degrees held, one bit per position in `catalogues/degrees.json` |
| varint n, then n varints | countries as positions in `catalogues/countries.json`, in the visitor's order of preference |
| varint n, then n strings | role words (each: varint length + UTF-8, at most 24 bytes; at most 8) |
| varint n, then n varints | deal-breaker chips as positions in `catalogues/vetoes.json` |
| varint n, then n strings | deal-breaker words, as the role words |
| 2 | CRC-16/CCITT-FALSE of everything before, big-endian |

Bitfields: position p of the catalogue is bit (p mod 8) of byte (p div 8); a position past the
field is left out of the code.

Sizes: an empty profile is 31 characters; a typical one 55 to 95; everything at once stays
under 450.

Rules that keep old codes meaningful: catalogues are append-only and never reordered; an
id unknown to the encoder is left out; a bit set for a position the decoder's catalogue
does not have yet is ignored. A change of layout is a new version byte.

## History

- **Version 2 (2026-09-05).** Families became the ISCO-08 unit groups of the vertical (37 of
  them, grouped as engineers, architects/planners/surveyors, technicians, supervisors, plant
  operators, ship and aircraft crews), so the family field grew from 4 to 8 bytes. A
  version-1 code named families that no longer exist; the decoder refuses it with the
  message to make a new one.
- **Version 1 (2026-09-04).** 19 hand-made families in a 4-byte field.
