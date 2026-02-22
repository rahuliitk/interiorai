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

## Architecture: Fully LLM Agent-Driven

The MEP calculator is **entirely driven by LLM agents** — no specialized engineering tools.

### How it works:

1. **Agent** receives room specifications, design selections, and fixture schedules
2. **Agent** applies formulas from NEC (electrical), IPC/UPC (plumbing), ASHRAE (HVAC)
3. **Pydantic** validates structured output (panel schedules, pipe sizing tables, load calculations)
4. **Agent** shows its work — every calculation cites the source standard and clause number
5. Results are validated against known textbook values in unit tests

### Why no specialized tools:

EnergyPlus, Ladybug Tools, and similar are designed for whole-building simulation of commercial structures — overkill for residential room-scale MEP. LLM agents with engineering formulas are more flexible, faster to set up, and produce human-readable calculation sheets.

### What the agent computes:

- **Electrical:** Load (W per circuit), wire gauge (NEC Table 310.16), voltage drop, panel schedule, conduit fill
- **Plumbing:** Fixture units (IPC Table 604.4), pipe sizing, drainage slope, hot water sizing
- **HVAC:** Cooling/heating load (ASHRAE Manual J simplified), equipment sizing (BTU/tonnage), duct sizing
- **Fire safety:** Smoke detector placement (NFPA 72), extinguisher locations

## Important

All calculations must cite their source standard (NEC, IEC, IS, IPC, UPC, etc.) and include unit tests with known textbook values.

## Tech Stack

- Python 3.11+ / FastAPI
- LangGraph (agent orchestration)
- LiteLLM (multi-provider API access)
- Pydantic (structured output validation)

## Status

Phase 2 — Planned
