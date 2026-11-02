# GeoExplore

A working prototype for mapping iron ore mines in India, detecting exposed iron-ore surfaces and,
later, estimating their Fe grade from satellite imagery. It is the web front end for the research
proposal *Iron Ore Mine Mapping, Detection and Grade Estimation in India: A Multispectral versus
Hyperspectral Machine-Learning Study* (Department of AI and ML, Manipal University Jaipur).

The study covers three iron ore belts:

| Belt | State | Example mines | Role |
| --- | --- | --- | --- |
| Singhbhum–Keonjhar | Jharkhand, Odisha | Noamundi, Joda, Gua, Barbil, Kiriburu | Training and validation |
| Bailadila | Chhattisgarh | Bacheli, Kirandul | Training and validation |
| Bellary–Hospet–Sandur | Karnataka | Donimalai, Kumaraswamy | Held out for testing |

Part of what you see is real data and part is generated, and the interface labels every
generated figure. The real part is the Stage 1 iron-mine inventory: 184 mapped mining polygons
in the three belts and the 160 iron ore mines inside them. The model scores are placeholders
until the Stage 2 detector is trained. Swapping in real model output is one environment variable
rather than a rewrite.

## What it does

**Map view.** The 184 mining polygons in the three belts, ranked by a model score and drawn over
satellite imagery with the GEM iron ore mines and indicative land-use constraints. Buttons along
the top jump between belts. Selecting a polygon shows its belt, its iron tag, the nearest GEM
mine and a SHAP breakdown of the Sentinel-2 features behind its score. There is a ranked table
for people who work from lists rather than maps, filters for score, road access and land use,
and a validation view that sets out how the model is tested.

**Production plan view.** Three years of daily production for ten large opencast iron ore mines,
a thirty-day forecast with P10 to P90 bands, a shortfall probability per mine, an equipment
downtime breakdown, and what-if sliders for rainfall and equipment availability that re-run the
forecast live. A language model turns the loaded records into a corrective plan that names
specific mines and times each step against the monsoon calendar.

**The assistant.** One assistant with two roles, and a separate conversation thread for each
screen. On the map it is a controller: it can select polygons, fly to mines, belts or
coordinates, toggle layers, change the basemap, apply filters, switch panels and export. On the
production screen it is a planning analyst grounded in the loaded records.

## What is real and what is generated

This matters more than any feature in the list above, and the rules are enforced in the code and
in the assistant's system prompts rather than left to good intentions.

| Real | Generated (labelled "synthetic") |
| --- | --- |
| Mining polygons and their areas (Maus et al. 2022) | Model score per polygon |
| Iron ore mines: names, locations, status, design capacity (GEM) | SHAP driver breakdown |
| Each polygon's iron tag and nearest GEM mine | Distance to road, land-use flag |
| Belt membership and training or test role | Constraint outlines (real places, invented shapes) |
| Counts of iron-tagged polygons on the analysis view | AUC, success curve and recovery rates |
| The ten production-plan mines and their capacities | Every daily production figure |

**The iron tag is a hint, not a label.** A polygon is tagged when a GEM iron-mine point lies
inside it or within 1 or 2 km. Manganese and iron–manganese mines sit right next to iron mines
around Joda and Barbil, so every polygon still has to be checked by hand before it becomes a
training label (see the review workbook below).

**The scores are placeholders.** Until Stage 2 is trained, each polygon's score is generated, but
it follows the real evidence: polygons with a GEM iron mine inside them score highest. The legend,
the detail card, the ranked list and the CSV export all say so.

**No Fe grade or tonnage appears anywhere.** Grade estimation is Stage 3 and is not built yet.
Optical sensors see only the surface, so buried ore is out of scope even then. Tonnage figures
appear only on the production screen, and only to describe a shortfall against a production plan
or the production a corrective action would recover. They never describe material in the ground.

**A model score is not a confidence.** It is labelled as a model score or a probability
throughout, never as a confidence interval.

**Distance to an existing mine is context, not evidence.** It is shown because it matters for
logistics, and it is excluded from the model's features so that ground is never ranked highly
merely for sitting near existing workings.

## Running it

Requires Node 20 or later. Developed on Node 24.

```
npm install
npm run dev
```

That starts Vite on port 5173 and the language-model proxy on port 8787. Open
http://localhost:5173. To run the site without the proxy, use `npm run dev:web` instead.

The application is fully usable without a language model key. The assistant answers and drives
both screens from the loaded data, and plan generation falls back to a written fixture plan.
Replies produced without the model are labelled in the interface.

The site needs no Python. The iron data it shows is already exported to
`src/data/fixtures/iron/belts.json`; Python is only needed to rebuild that file (see
[The data pipeline](#the-data-pipeline)).

### Adding a Gemini key

Copy the example file and add your own key. It is read server-side only and never reaches the
browser.

```
cp .env.example .env
```

Then edit `.env`:

```
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

Restart `npm run dev` and check it took:

```
curl -s localhost:5173/api/health
```

`key_configured` should read `true`.

Two things worth knowing. Google retires model names without much notice, so the proxy walks a
fallback list rather than failing outright if the configured model has gone. And a free-tier key
is capped at twenty requests per day per model, which the heavy plan generation will reach
quickly. If plan generation keeps falling back to the fixture, check the proxy log for a 429.

### Other commands

```
npm run build      Type-check and build for production
npm run preview    Serve the production build
npm run lint       Run oxlint
npm run dev:web    Vite only, without the proxy
```

## The data pipeline

`pipeline/` holds the Python scripts for Stage 1 of the proposal: turning global mining polygons
into an iron-mine inventory for the three belts.

### Sources

| Dataset | Licence | Where it goes | How to get it |
| --- | --- | --- | --- |
| Maus et al. 2022, Global-scale mining polygons v2 | CC BY-SA 4.0 | `data/raw/global_mining_polygons_v2.gpkg` | [PANGAEA.942325](https://doi.org/10.1594/PANGAEA.942325), about 24 MB |
| Global Energy Monitor, Global Iron Ore Mines Tracker, Sept 2026 (V1) | CC BY 4.0 | `data/raw/gem/*.xlsx` | Form on the [GEM tracker page](https://globalenergymonitor.org/projects/global-iron-ore-mines-tracker/#download); only the main spreadsheet is needed |
| Jasansky et al. 2023, Open database on global coal and metal mine production | CC BY 4.0 | `data/raw/mine_production/` (unzipped) | [Zenodo 7369478](https://zenodo.org/records/7369478) |
| Extra iron-mine points (optional) | — | `data/raw/iron_points_extra.csv` | Hand-made: `name,lat,lon,source[,precision]` |

The Maus polygons carry no commodity field, so iron mines are found by matching polygons to
iron-mine points. GEM is the main point source: 252 Indian iron mines, 222 of them with exact
coordinates, sourced from Indian Bureau of Mines filings. The Jasansky database lists only five
usable Indian iron mines, all in Goa, so it adds almost nothing for these belts. Use
`iron_points_extra.csv` only for mines still missing after the GEM join. `data/raw/` is
git-ignored.

Each GEM mine page links to IBM's inspection report for that mine. These reports give pit and
dump coordinates, areas under mining and the grades sorted at the mine. Read them by hand: the
UTM zone is not printed, and some coordinates are missing a digit.

### Setup

```
python -m venv pipeline/.venv
pipeline/.venv/Scripts/python.exe -m pip install geopandas pyogrio shapely pandas openpyxl
```

On Linux or macOS the interpreter is `pipeline/.venv/bin/python`.

### Scripts

Run them in this order from the project root:

```
pipeline/.venv/Scripts/python.exe pipeline/build_iron_inventory.py
pipeline/.venv/Scripts/python.exe pipeline/make_review_sheet.py
pipeline/.venv/Scripts/python.exe pipeline/make_map.py
pipeline/.venv/Scripts/python.exe pipeline/export_app_data.py
npx tsx pipeline/make_sample_production.ts
```

| Script | What it does | Writes |
| --- | --- | --- |
| `build_iron_inventory.py` | Keeps the Indian polygons and tags each one iron when a mine point lies inside it or within 0, 1 or 2 km. GEM points marked approximate get 3 km added to each buffer. Also checks that the big belt mines are present. | `data/processed/` GeoJSON files and `summary.txt` |
| `make_review_sheet.py` | Builds the manual-review workbook for every belt polygon. Re-running keeps anything already typed in. | `data/review/belt_polygon_review.xlsx` |
| `make_map.py` | A standalone map of the Stage 1 result for checking it by eye. | `data/review/iron_inventory_map.html` |
| `export_app_data.py` | Exports belts, polygons and mines for the website. | `src/data/fixtures/iron/belts.json` |
| `make_sample_production.ts` | Regenerates the downloadable sample production file from the app's own generator. | `public/sample_production_iron_12m.csv` |

### Current result

| Belt | Polygons | Area | Iron-tagged at 0 / 1 / 2 km | GEM mines | Mines with no polygon within 2 km |
| --- | --- | --- | --- | --- | --- |
| Singhbhum–Keonjhar | 126 | 95 km² | 47 / 87 / 106 | 91 | 14 |
| Bailadila | 8 | 16 km² | 5 / 6 / 8 | 9 | 1 |
| Bellary–Hospet–Sandur | 50 | 132 km² | 26 / 29 / 35 | 60 | 2 |

The mines with no nearby polygon were either opened after the 2019 imagery the polygons were
drawn from, or were missed by the polygon set. The Tang and Werner mine footprint polygons are
the next place to look for them.

### Manual review

`data/review/belt_polygon_review.xlsx` has one row per belt polygon, with a satellite map link,
the nearest GEM mine, a link to its GEM page, and five columns to fill in: commodity, surface type
(pit or bench, stockpile, waste dump, tailings, plant), active or inactive, notes and reviewer.
Every polygon is checked, not a sample, because the iron tag cannot tell an iron pit from a
manganese one a kilometre away. A second sheet lists the GEM mines with no mapped polygon.

## How it is put together

```
src/
  types/        Zone, Mine, Belt, ProductionRecord, Forecast, Recommendation, ProductionPlan
  data/
    adapters/   The one seam between the interface and its data
    fixtures/   Iron belts, polygons and GEM mines (iron/belts.json), the fallback plan
  stores/       map, plan, chat, route and ui state (Zustand)
  components/
    shell/      Top bar, sidebar, page frame
    map/        MapLibre canvas, legend, scale bar, locator inset, controls
    plan/       Upload, validation, charts
    chat/       Assistant panel, prompts, offline interpreter, detail cards
    analysis/   Model validation view
  pages/        MapView, PlanView
  lib/          Proxy client, chat actions, colour ramp, formatting, CSV parsing, seeded RNG
server/
  index.ts      Express proxy for the language model
pipeline/       Stage 1 Python scripts (see above)
data/
  raw/          Downloaded datasets (git-ignored)
  processed/    Tagged polygons and points
  review/       Review workbook and inventory map
```

### The adapter layer

No component knows whether it is looking at generated data or a live backend. Everything goes
through one interface:

```
VITE_DATA_SOURCE=mock    src/data/adapters/mock    real Stage 1 data plus seeded generators
VITE_DATA_SOURCE=api     src/data/adapters/api     stubbed against the ML pipeline's endpoints
```

Both satisfy the same `DataAdapter` contract, and nothing outside `src/data` imports from
`fixtures/` or `mock/` directly. When the Stage 2 and Stage 3 models are ready, the API adapter is
filled in and the environment variable is flipped.

### The proxy

`server/index.ts` sits between the browser and Google. It reads `GEMINI_API_KEY` from the process
environment only, so the key never appears in client code or in a `VITE_` variable. It
rate-limits per IP, gives each model attempt its own timeout (ninety seconds for the large JSON
plan, thirty for a chat turn), walks a fallback list of model names when one is retired or
overloaded, and logs every request so the thing is debuggable during a demo.

### Generated data

`src/data/adapters/mock/generate.ts` starts from the real polygons and mines and generates only
what Stage 2 has not produced yet, seeded so that every run is identical:

- A score for each real polygon, drawn from a band set by its iron tag, with a long tail inside
  each band
- SHAP driver sets over the Sentinel-2 features the proposal uses: the 0.9 µm ferric-iron
  absorption depth, ferric and iron-oxide band ratios, a clay ratio standing in for lateritic
  soil (the main confuser), dry-season NDVI, bare-surface change between two dry seasons, slope
  and texture
- Three years of daily production for the ten largest operating mines in the belts (five in
  Singhbhum–Keonjhar, three at Bailadila, two at Sandur), with monsoon suppression, Weibull
  equipment failures and festival absenteeism, sized from each mine's real GEM design capacity
- Forecast bands that widen with horizon

Production is modelled as capability-driven and independent of the plan it is measured against,
so plan achievement comes out as a consequence rather than being fixed by construction. Every
mine is opencast, so the monsoon is the dominant driver: bench access, haul roads, blasting and
despatch all suffer in the wet window. Shortfall probability is a normal approximation over the
cumulative forecast band, with an explicit assumption about serial correlation, because daily
misses are driven by weather and equipment faults that persist for days.

## Using the interface

### Polygons

Interaction is deliberately two-stage so that browsing the map does not flood the chat.

| Action | Selects the polygon | Opens its detail in the chat |
| --- | --- | --- |
| Map | single tap | double tap |
| Ranked list | click | double click |
| Keyboard | arrow keys cycle by rank | Enter |
| Deep link | | yes |

Escape clears the selection. With 184 polygons and 160 mines on screen, only the top 20 rank
numbers are labelled until you zoom in, and mine names appear from zoom level 11.

### Talking to the map

| Say | What happens |
| --- | --- |
| `show 10`, `zone 10` | selects the polygon ranked 10 and explains what drives its score |
| `IND00342` | selects that polygon by its id |
| `take me to Noamundi` | flies to a GEM iron mine; short names work |
| `show Bailadila` | flies to a belt |
| `22.16, 85.53` | flies to a coordinate |
| `hide the constraints`, `show labels` | layer visibility |
| `switch to terrain` | basemap |
| `only zones above 0.85 within 5 km of a road` | filters |
| `open the ranked list`, `why should I trust this` | panel changes |
| `export the targets` | CSV download |

### Talking to the production plan

Ask about a mine by name (`tell me about Joda East`), why a step sits in a particular week, or run
a scenario. `rainfall at 140%` and `equipment at 70%` re-run the forecast. The assistant names
mines, quotes their figures and explains the mechanism rather than the correlation.

### Deep links

The URL reproduces an exact screen, so screenshots and a demo recording are repeatable.

```
/?zone=IND00342   map with that polygon selected, centred and explained
/?panel=list      ranked target table
/?panel=analysis  model validation
/?view=plan       production plan
```

### Loading your own production data

The upload panel parses a CSV in the browser; nothing is sent anywhere. Required columns are
`date`, `mine_id`, `planned_tonnes`, `actual_tonnes`, `equipment_available_pct`,
`downtime_hrs_crusher`, `downtime_hrs_loader`, `blasts_planned`, `blasts_executed`,
`workers_present_pct` and `rainfall_mm`. The optional columns `downtime_hrs_hoist`,
`blast_delay_flag`, `rain_cum_7`, `rain_cum_30`, `soil_moisture`, `is_monsoon` and
`shortfall_flag` are derived from the rest of the file when they are absent.
`downtime_hrs_hoist` is left empty because every mine here is opencast, and a blank there is
treated differently from a zero. `mine_id` is the GEM asset ID.

`public/sample_production_iron_12m.csv` is a correctly formatted twelve-month reference file,
linked from the upload panel. The Load sample data button pulls three years straight from the
adapter, so a demo never depends on a file being present.

## Technical notes

React 19, TypeScript in strict mode, Vite, Tailwind, MapLibre GL, Recharts, Zustand, Express.
GeoPandas for the pipeline.

MapLibre rather than Mapbox, and Esri's free tile services rather than anything token-gated, so
there is no credential to expire in the middle of a presentation.

Dark mode is a `dark` class on `<html>`, toggled by the sun/moon button in the top bar. The choice
is saved in the browser, and the system setting is used until one is made. An inline script in
`index.html` applies it before first paint, so the page never flashes white. The palette is neutral
charcoal on a `#191919` base. Named colours (`canvas`, `ink`, `line`…) are CSS variables in
`src/index.css`, and the hard-coded colour utilities get generated dark rules in
`src/styles/dark-overrides.css`. After adding a new hard-coded colour class, regenerate them with
`node scripts/gen-dark-css.mjs`. Changes to `tailwind.config.js` need a dev-server restart.

A few things in here are not obvious and are worth leaving a note about, because each cost real
time to find.

Vite's dependency pre-bundler drops MapLibre's worker file, and the failure is silent: the raster
basemap renders normally while every vector layer quietly never appears, because the GeoJSON
worker never responds. `optimizeDeps: { exclude: ['maplibre-gl'] }` in `vite.config.ts` is what
fixes it, and removing that line will break the map in a way that looks like a data problem
rather than a build problem.

Zustand selectors that build a new array or object on each call will spin React into an infinite
render loop through `useSyncExternalStore`, which surfaces as "Maximum update depth exceeded"
pointing at a component that looks innocent. Derived collections in this codebase are memoised or
return a shared constant for exactly this reason.

The locator inset draws directly rather than through `requestAnimationFrame`, because that
callback does not run in a backgrounded tab and the inset would otherwise come up empty for anyone
who opened the page in a background tab and switched to it later.

Production records are seeded per mine from a hash of the whole GEM asset ID. Every GEM ID starts
with the same characters, so seeding from the first few characters gives every mine an identical
history.

`node_modules` is platform-specific. A copy moved between Linux and Windows carries the wrong
native builds for Vite's bundler and the linter; delete it and run `npm install` again.

## Limitations

This is a prototype built to be shown, and it is worth being straight about where the edges are.

Only Stage 1 is real. Stage 2 (iron-ore surface detection), Stage 3 (Fe grade) and Stage 4 (the
multispectral versus hyperspectral comparison) are not trained yet, so scores, drivers and
validation figures are placeholders. Once they exist, the analysis view will report the same
diagnostics against the manually verified polygons, and grade against IBM inspection-report grade
classes.

The iron tags are unreviewed. Until every belt polygon has been checked, some iron-tagged polygons
will be manganese, waste dumps or plant, and some untagged ones will be iron.

The polygons date from 2019 imagery, so newer pits are missing. Seventeen GEM mines in the belts
have no polygon within 2 km.

The land-use constraints are indicative shapes at real places, not the actual forest and
protected-area boundaries, which would come from the Forest Survey of India and state records.

## Data credits

- Maus, V. et al. (2022). Global-scale mining polygons (Version 2). PANGAEA,
  https://doi.org/10.1594/PANGAEA.942325. CC BY-SA 4.0.
- Global Energy Monitor, Global Iron Ore Mines Tracker, September 2026 (V1) release. CC BY 4.0.
- Jasansky, S. et al. (2023). An open database on global coal and metal mine production.
  Scientific Data 10, 52. Zenodo 7369478. CC BY 4.0.

---

<sub>Built by Akshat Kumar.</sub>
