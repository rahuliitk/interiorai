# Project Service

Project and schedule management for OpenLintel.

## Responsibilities

- Project lifecycle management (draft to completion)
- Auto-generated construction schedules (Gantt)
- Trade dependency mapping and critical path identification
- Milestone tracking and delay cascade management
- Daily site logs and progress documentation
- Change order workflow with cost/timeline impact analysis

## Architecture: LLM Agent + Temporal

1. **Agent** generates construction schedules from design specifications and trade dependencies
2. **Temporal** orchestrates the durable project lifecycle workflow
3. **OR-Tools** solves schedule optimization and critical path analysis
4. **Agent** handles change order impact analysis — cost, timeline, and dependency cascades

### Specialized Tools

| Tool | License | Role |
|------|---------|------|
| [Temporal](https://github.com/temporalio/temporal) | MIT | Durable workflow orchestration for project lifecycles |
| [Google OR-Tools](https://github.com/google/or-tools) | Apache-2.0 | Schedule optimization and critical path analysis |

### LLM Agent handles

- Schedule generation from design specs and trade knowledge
- Trade dependency mapping
- Change order impact analysis
- Daily progress interpretation and delay prediction

## Status

Phase 3 — Planned
