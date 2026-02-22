# Collaboration Service

Real-time collaboration and communication hub for OpenLintel.

## Responsibilities

- WebSocket-based real-time design collaboration
- Threaded discussions (per room, per element)
- Role-based access control (homeowner, designer, contractor, factory)
- Digital approval workflows
- Notification dispatch (email, push, SMS, WhatsApp)
- Design version history and diff

## Specialized Tools

| Tool | License | Role |
|------|---------|------|
| [Y.js](https://github.com/yjs/yjs) | MIT | CRDT-based real-time collaborative editing |
| [Socket.IO](https://github.com/socketio/socket.io) | MIT | WebSocket transport for real-time events |

*No LLM agent role — this is infrastructure-level real-time sync.*

## Status

Phase 2 — Planned
