# Oak coverage of AQA GCSE Combined Science: Trilogy (8464)

Checked 2026-09-29 against Oak National Academy's programme
[combined-science-secondary-ks4-foundation-aqa](https://www.thenational.academy/teachers/programmes/combined-science-secondary-ks4-foundation-aqa/units).
Every unit's `/lessons` page returned 200 on the day (observed, 50 of 50 with `curl`). A unit URL without
`/lessons` returns 404.

Oak units are not keyed to AQA ids. The mapping below is this project's own, made from the unit and
lesson titles. Section numbers are identifiers from the AQA specification; no AQA wording is used.
Only the foundation programme was checked; the higher-tier programme was not.

## Verdict on PRD R9

**Enough at section level, partial at lesson level (observed).** All 24 of the 8464 content sections
(4.1 to 4.7, 5.1 to 5.10, 6.1 to 6.7) have at least one Oak unit. In 10 of those 24 sections, some
content has no lesson whose title covers it (see Gaps). Those parts need own-written lessons.

## Units

URL: `https://www.thenational.academy/teachers/programmes/combined-science-secondary-ks4-foundation-aqa/units/<slug>/lessons`.
Lesson counts are from the units page.

| Year | Section | Oak unit (slug) | Lessons | 8464 sections covered |
|---|---|---|---|---|
| 10 | 4 Biology | eukaryotic-and-prokaryotic-cells | 7 | 4.1 |
| 10 | 4 Biology | dna-and-the-genome | 3 | 4.6 |
| 10 | 4 Biology | health-and-disease | 9 | 4.3; 4.2 (heart disease, cancer, risk factors) |
| 10 | 4 Biology | biological-molecules-and-enzymes | 8 | 4.2 (enzymes) |
| 10 | 4 Biology | transport-and-exchange-surfaces-in-humans | 7 | 4.2 (heart, blood, vessels); 4.1 (diffusion, osmosis, active transport) |
| 10 | 4 Biology | coordination-and-control-the-human-nervous-system | 4 | 4.5 |
| 10 | 4 Biology | coordination-and-control-hormones-and-the-human-endocrine-system | 3 | 4.5 |
| 10 | 4 Biology | photosynthesis-requirements-and-products | 2 | 4.4 |
| 10 | 4 Biology | inheritance-genotype-and-phenotype | 4 | 4.6 |
| 10 | 4 Biology | cell-division-mitosis-and-meiosis | 5 | 4.1 (mitosis); 4.6 (meiosis) |
| 10 | 4 Biology | stem-cells-and-differentiation | 4 | 4.1 |
| 10 | 4 Biology | fossil-evidence-selective-breeding-and-explaining-evolution | 4 | 4.6 |
| 10 | 4 Biology | living-organisms-and-their-environments | 8 | 4.7 |
| 11 | 4 Biology | defences-against-pathogens-the-human-immune-system-and-vaccination | 4 | 4.3 |
| 11 | 4 Biology | aerobic-and-anaerobic-cellular-respiration | 4 | 4.4 |
| 11 | 4 Biology | biomass-transfer-food-security-and-biodiversity | 4 | 4.7 |
| 11 | 4 Biology | transport-and-exchange-surfaces-in-plants | 8 | 4.2 (plant tissues, transpiration); 4.1 |
| 11 | 4 Biology | hormones-and-human-reproduction | 2 | 4.5 |
| 11 | 4 Biology | coordination-and-control-maintaining-a-constant-internal-environment | 3 | 4.5; 4.1 (osmosis practical) |
| 11 | 4 Biology | photosynthesis-factors-affecting-the-rate | 4 | 4.4 |
| 11 | 4 Biology | drugs-and-new-treatments-for-disease | 2 | 4.3 |
| 11 | 4 Biology | variation-and-natural-selection-at-the-genetic-level | 3 | 4.6 |
| 11 | 4 Biology | classification-in-modern-biology | 4 | 4.6; 4.1 (electron microscopy) |
| 11 | 4 Biology | gene-technology | 3 | 4.6 |
| 10 | 5 Chemistry | atomic-structure-and-the-periodic-table | 8 | 5.1; 5.3 (relative formula mass) |
| 10 | 5 Chemistry | structure-and-bonding | 11 | 5.2 |
| 10 | 5 Chemistry | states-of-matter | 7 | 5.2 (states); 5.8 (pure substances) |
| 10 | 5 Chemistry | separating-substances | 15 | 5.8; 5.10 (potable water, waste water) |
| 10 | 5 Chemistry | calculations-involving-masses | 5 | 5.3 |
| 10 | 5 Chemistry | making-salts | 10 | 5.4; 5.3 (concentration) |
| 10 | 5 Chemistry | chemistry-of-carbon | 7 | 5.2 (forms of carbon); 5.7 (hydrocarbons) |
| 10 | 5 Chemistry | energy-changes-in-reactions | 5 | 5.5 |
| 11 | 5 Chemistry | rate-of-reaction | 11 | 5.6 |
| 11 | 5 Chemistry | using-earths-resources | 7 | 5.10; 5.7 (crude oil, cracking); 5.4 (extraction) |
| 11 | 5 Chemistry | groups-of-the-periodic-table | 4 | 5.1 |
| 11 | 5 Chemistry | atmosphere-and-changing-climate | 10 | 5.9; 5.7 (burning hydrocarbons) |
| 11 | 5 Chemistry | electrolysis | 7 | 5.4 |
| 11 | 5 Chemistry | industrial-chemistry | 2 | 5.6 (reversible reactions, equilibrium) |
| 10 | 6 Physics | particle-explanations-of-density-and-pressure | 6 | 6.3 (density); 6.5 (pressure) |
| 10 | 6 Physics | measuring-and-calculating-motion | 12 | 6.5 |
| 10 | 6 Physics | electric-fields-and-circuit-calculations | 6 | 6.2 |
| 10 | 6 Physics | measuring-waves | 10 | 6.6 |
| 10 | 6 Physics | energy-of-moving-objects | 9 | 6.1 (work, power, efficiency, energy stores); 6.5 (springs) |
| 10 | 6 Physics | energy-of-moving-particles | 7 | 6.1 (conduction, specific heat capacity); 6.3 (latent heat) |
| 10 | 6 Physics | circuit-components | 6 | 6.2 |
| 11 | 6 Physics | forces-make-things-change | 6 | 6.5 |
| 11 | 6 Physics | nuclear-physics | 7 | 6.4 |
| 11 | 6 Physics | electromagnetism | 5 | 6.7 |
| 11 | 6 Physics | electromagnetic-waves | 7 | 6.6 |
| 11 | 6 Physics | mains-electricity | 6 | 6.2 (mains, National Grid); 6.1 (energy resources) |

Count: 50 units, 24 biology, 14 chemistry, 12 physics (observed).

## Gaps

Judged from lesson titles only. "Not found" means no lesson title covers it; a lesson may still touch it.

| Section | Not found in Oak lesson titles |
|---|---|
| 4.2 | The digestive system; lungs and gas exchange |
| 4.4 | The body's response to exercise |
| 4.7 | Trophic levels and biomass transfer (the unit slug names biomass, its four lessons do not) |
| 5.3 | The mole |
| 5.8 | Tests for gases |
| 5.10 | Corrosion, ceramics and composites (alloys appear in structure-and-bonding) |
| 6.1 | Energy stores and transfers, and conservation of energy, as a lesson of their own |
| 6.2 | Static electricity |
| 6.3 | Internal energy as a named lesson |
| 6.5 | Weight and gravity; scalars and vectors as a topic |

## Used in this pack

`8464/4.1.1.2` Animal and plant cells draws on three lessons of `eukaryotic-and-prokaryotic-cells`:
`animal-cells-common-structures-and-specialised-cells`, `plant-cells-common-structures-and-specialised-cells`
and `light-microscopy-observing-and-drawing-cells` (all 200, 2026-09-29). See `LICENCE.md`.
