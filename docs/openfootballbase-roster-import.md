# OpenFootballBase roster import — 2026/27

## Applied import

The approved 2026/27 import added **1,224 player records** to the existing club database:

- 87 clubs received new players across 14 competitions.
- 176 players have a specific role supported by Wikidata P413.
- 1,048 retain the source's broad, honest position group: DF, MF or FW.
- Goalkeepers retain the exact GK category.
- No clubs were added and no existing player records were overwritten or removed.
- Teams were capped at 30 players; teams already at or above the cap received no additions.
- The database grew from 3,253 to 4,477 players while remaining at 261 clubs.

## Import safeguards

A candidate was eligible only when all required conditions were met:

1. The club name matched exactly after conservative normalization, within the same league.
2. The player had a unique source QID across the candidate set.
3. The player's name was not already present anywhere in the game database and was not ambiguous within the source club.
4. The source provided a precise birth date; age was calculated as of 2026-11-24 and restricted to 15–45 for this import.
5. Nationality was available as an uppercase ISO alpha-3 code.
6. Position was either a specific supported role from Wikidata P413 or an explicitly labeled broad group from OpenFootballBase.

Overall and market value are gameplay estimates, not claims from the source. Every imported player stores source provenance, QID, source page revision, language, license and position precision.

## Sources and licensing

- OpenFootballBase-Data release `data-1.24.6`: squad data derived from Wikipedia under CC BY-SA 4.0.
- Wikidata fields and position claims (P413): CC0.
- Original page title and revision are retained on each imported player for attribution and traceability.

## Completion policy

This import is a meaningful roster expansion, not a declaration that any league is complete. A league is only marked complete by the readiness checker when every club meets the roster-size and player-metadata requirements and all reference, identity and duplicate checks pass.
