# French site managers, and the bare "conducteur"

Research of 23 September 2026, after 377 offers titled "conducteur…" were found filed as power
and chemical plant operators (3131, 3133): site managers, forklift and truck drivers, even a
"semi-conducteurs" chip architect.

## Why

ESCO lists the bare word "conducteur" (and "conductrice") among the French titles of power plant
operators (3131.1.2 to 3131.1.5), a chemical plant operator (3133.1.1) and a ship's crew
occupation (3152.5). The gate matches whole titles, so any French title holding the word matched
them. The gate already sets aside bare role nouns of this kind ("operator", "technician",
"coordinator"): they name no occupation alone.

## Where a French site manager belongs

- **INSEE** (PCS 481a, "Conducteurs de travaux (non cadres)"): professionals who run one or more
  construction sites technically and administratively, order from suppliers and represent their
  firm before the architect or the client. Its titles include "conducteur de travaux" and
  "conducteur de chantier".
- **ILO, ISCO-08**: construction supervisors (3123) "co-ordinate, supervise and schedule the
  activities of workers engaged in the construction and repair of buildings and structures".
  Their examples are "building construction supervisor" and "site manager (construction)". The
  construction managers who plan and direct whole projects are 1323, outside this site's
  occupations.
- **ESCO** has no French title "conducteur de travaux". Its search brings "chef de chantier
  travaux publics et voirie", a construction supervisor.

## Decisions

- "Conducteur" and "conductrice" join the gate's role words.
- The French site-manager titles join construction supervisors (3123) as extra terms: "conducteur
  de travaux", "conducteur des travaux", "conducteur travaux", "conducteur de chantier(s)", and
  their feminine forms.
- French gender endings go before a title is read, as the other gender marks do:
  - in brackets: "Conducteur(trice)", "Ingénieur(e)";
  - after a middle dot: "technicien·ne";
  - after a slash: "conducteur/trice".

  Without this, the same title was read differently with and without its ending.

## Effect on the store of 23 September

`builder/tools/compare-gates.mjs` ran every advert (961,004) through both gates:

| Change | Adverts | What they are |
|---|---:|---|
| 3131/3133(/3152) → out | 306 | Drivers and operators of machines, lines, forklifts, excavators, packaging |
| 3131/3133(/3152) → 3123 | 296 | Site managers: "Conducteur de travaux", "Conducteur(trice) Travaux", "Conducteur de chantiers" |
| Sales and marketing titles → out | 24 | "Ingénieur(e) Commercial(e)", "Ingénieur(e) d'affaires": the ending hid the sales words |
| Other families → a closer one | 74 | "Ingénieur(e) Industrialisation" to industrial engineers, "Ingénieur(e) électricien" to electrical |
| Out → in | 9 | "Administrateur(trice) systèmes Linux", "Technicien(ne) informatique" |

709 adverts change in all.

## Sources

- INSEE, PCS 2003, 481a "Conducteurs de travaux (non cadres)":
  https://www.insee.fr/fr/metadonnees/pcs2003/professionRegroupee/481a
- ILO, ISCO-08 definitions (3123 construction supervisors, 1323 construction managers):
  https://www.ilo.org/media/42041/download
- ESCO occupation search: https://ec.europa.eu/esco/api/search?text=conducteur%20de%20travaux&language=fr&type=occupation
