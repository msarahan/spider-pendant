# Spider Pendant Light Layout Calculator

## Overview

A web-based interactive calculator for planning multi-ring spider pendant light fixtures. Designed for situations where you have a central ceiling-mounted canopy with multiple cords radiating outward to individual light sockets, arranged in concentric rings of varying radius and hanging height.

Built with React, deployed via Claude.ai artifact publishing.

-----

## What It Does

Given the physical constraints of your fixture (fixed cord length, room dimensions, bulb size), the calculator computes clearance and sag geometry for each ring and warns you when anything falls below safe head-clearance thresholds.

### Cord Geometry (per ring)

Each cord has three segments:

1. **Catenary arc** — runs horizontally at ceiling level from the central hub out to the ring radius, sagging downward under its own weight. The arc uses `cordLength − drop` feet of cable.
1. **Straight drop** — hangs vertically from the arc endpoint down by `drop` feet to the socket.
1. **Socket + bulb** — the fixture assembly hanging below the drop.

### Physics

Cord sag is computed using the true **catenary equation** (`y = c·cosh(x/c)`), solved numerically via bisection for the catenary parameter `c`. This gives accurate sag for any amount of slack, unlike parabolic approximations.

-----

## Parameters

### Global (apply to all rings)

|Parameter          |Description                                                 |
|-------------------|------------------------------------------------------------|
|Ceiling height     |Floor-to-ceiling distance                                   |
|Cord length        |Fixed cable length — identical for every cord on the fixture|
|Bulb height        |Adds to socket height; reduces clearance                    |
|Total socket budget|How many sockets the fixture has in total                   |

### Per Ring

|Parameter      |Description                                                        |
|---------------|-------------------------------------------------------------------|
|Sockets in ring|Count of lights in this ring                                       |
|Radius         |Horizontal distance from canopy center to socket                   |
|Vertical drop  |Length of the straight drop segment from arc endpoint to socket top|
|Socket height  |Height of the socket/Edison base assembly                          |

-----

## Outputs (computed, not user-set)

|Output            |Description                                                             |
|------------------|------------------------------------------------------------------------|
|Socket clearance  |Distance from socket bottom to floor                                    |
|Cord sag clearance|Distance from lowest point of arc to floor                              |
|Sag depth         |How far below ceiling the arc dips at midspan                           |
|Arc slack         |Spare cord available to form the catenary (`cordLength − drop − radius`)|

Warnings fire in **red** when socket or sag clearance falls below **7 feet**. A separate **amber** warning fires when the total sockets assigned across rings doesn’t match the fixture’s socket budget.

-----

## Views

**Side Elevation** — cross-section showing one cord profile per ring (left and right of center), with catenary arc, straight drop, socket, and clearance brackets labeled per ring.

**Top View** — plan view showing concentric rings with all sockets plotted at correct angular spacing, plus a budget mismatch banner when assigned sockets ≠ budget.

**Ring Summary Table** — one row per ring showing all parameters and computed outputs, color-coded to match the diagrams.

-----

## Ring Budget System

The fixture has a fixed total number of sockets (e.g. a factory-wired 12-socket spider). You distribute those sockets across rings using +/− steppers. If the rings don’t add up to the budget, an amber warning appears in the top-view diagram and the summary table footer.

-----

## Tech Stack

- **React** (functional components, hooks)
- **SVG** for both elevation and top-view diagrams
- Imperial units throughout (feet and inches)
- No external dependencies beyond React

-----

## Development Notes

- All catenary math uses a **bisection solver** (not Newton’s method, which diverges for large slack values)
- Cord geometry was carefully modeled: the arc is horizontal at ceiling level; the drop is a separate segment not part of the arc span
- The catenary sag formula is `sagT = c·(cosh(D/2c) − cosh(lx/c))` — zero at endpoints, maximum at midspan

