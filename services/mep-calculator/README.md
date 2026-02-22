# MEP Calculator

Mechanical, Electrical, and Plumbing engineering calculations for OpenLintel.

## Responsibilities

### Electrical
- Load calculation (lighting, power, HVAC, motor, EV charging)
- Circuit grouping and panel schedule design
- Wire gauge sizing with voltage drop verification
- Conduit routing optimization

### Plumbing
- Pipe sizing based on simultaneous demand
- Drainage slope calculations
- Fixture unit calculations
- Hot water system sizing

### HVAC
- Cooling/heating load calculation (room volume, orientation, glazing, occupancy)
- Equipment tonnage/BTU recommendation
- Duct sizing for centralized systems

## Open-Source Tools

| Tool | License | Role |
|------|---------|------|
| [EnergyPlus](https://github.com/NREL/EnergyPlus) | BSD-3 | Whole-building energy simulation for HVAC load calculations |
| [EPpy](https://github.com/santoshphilip/eppy) | MIT | Python scripting for EnergyPlus model creation |
| [Ladybug Tools](https://github.com/ladybug-tools) | AGPL-3.0 | Solar analysis, daylight simulation, thermal comfort evaluation |
| python-hvac | — | Psychrometric calculations, duct sizing formulas |
| [OpenStudio](https://github.com/NREL/OpenStudio) | BSD-3 | Building energy model creation and parametric analysis |

## Tech Stack

- Python 3.11+
- FastAPI
- NumPy

## Important

All engineering calculations must cite their source standard (NEC, IEC, IS, IPC, UPC, etc.)
and include unit tests with known textbook values.

## Status

Phase 2 — Planned
