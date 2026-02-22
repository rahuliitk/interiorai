# Contributing to InteriorAI

Thank you for your interest in contributing to InteriorAI! This project is ambitious and we need help from many different disciplines — software engineers, ML engineers, CAD specialists, architects, interior designers, electrical engineers, plumbers, and more.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Branching & Workflow](#branching--workflow)
- [Commit Messages](#commit-messages)
- [Pull Requests](#pull-requests)
- [Coding Standards](#coding-standards)
- [Domain-Specific Contributions](#domain-specific-contributions)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Community](#community)

---

## Code of Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it. Report unacceptable behavior to conduct@interiorai.dev.

## How Can I Contribute?

### Code Contributions

| Area | Skills Needed | Priority |
|------|--------------|----------|
| 3D Design Editor | WebGL, Three.js, React | High |
| Floor Plan Digitizer | Python, OpenCV, ML | High |
| Drawing Generator | DWG/DXF format, Python | High |
| Cut List Engine | Optimization algorithms, Python | High |
| MEP Calculators | Domain expertise + Python | Medium |
| Product Catalogue | API design, data modeling | Medium |
| Mobile App | React Native or Flutter | Medium |
| AR Features | ARKit, ARCore, WebXR | Low (Phase 2+) |

### Non-Code Contributions

- **Building Code Databases** — Help us catalog building codes for your region
- **Material Databases** — Contribute product specs for local brands/retailers
- **Documentation** — Technical docs, tutorials, translations
- **Design** — UI/UX design, icons, illustrations
- **Testing** — Manual testing, edge cases, accessibility testing
- **Domain Expertise** — Review our engineering calculations, suggest missing requirements

## Development Setup

### Prerequisites

```bash
# Required
node --version    # >= 20.0.0
python --version  # >= 3.11
docker --version  # >= 24.0

# Recommended
pnpm --version    # >= 9.0 (package manager)
```

### First-Time Setup

```bash
# Fork and clone
git clone https://github.com/<your-username>/interiorai.git
cd interiorai

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env

# Start infrastructure (database, redis, etc.)
docker compose up -d postgres redis

# Run migrations
pnpm run db:migrate

# Start dev server
pnpm run dev
```

### Running Tests

```bash
# All tests
pnpm test

# Specific service
pnpm test --filter=@interiorai/bom-engine

# With coverage
pnpm test -- --coverage

# ML model tests (requires GPU or will use CPU fallback)
cd ml/room-segmentation && python -m pytest
```

## Branching & Workflow

We use a **trunk-based development** model:

- `main` — stable, deployable code
- `feature/<description>` — new features
- `fix/<description>` — bug fixes
- `docs/<description>` — documentation changes

```bash
# Create a feature branch
git checkout -b feature/cutlist-grain-direction

# Make changes, commit, push
git push -u origin feature/cutlist-grain-direction

# Open a Pull Request against main
```

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

| Type | Use For |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `perf` | Performance improvement |
| `chore` | Build process, tooling, dependencies |

**Scopes:** `web`, `mobile`, `design-engine`, `drawing-gen`, `bom`, `cutlist`, `mep`, `catalogue`, `procurement`, `infra`, `docs`

**Examples:**

```
feat(cutlist): add grain direction to panel output
fix(bom): correct tile waste factor calculation for diagonal layouts
docs(mep): add electrical load calculation methodology
refactor(design-engine): extract room segmentation into separate module
```

## Pull Requests

### Before Submitting

- [ ] Code compiles and all existing tests pass
- [ ] New code has tests (aim for >80% coverage on new code)
- [ ] No linting errors (`pnpm lint`)
- [ ] Documentation updated if behavior changed
- [ ] Commit messages follow conventional commits format
- [ ] PR description explains **what** and **why**, not just **how**

### PR Template

Your PR description should include:

```markdown
## What does this PR do?
Brief description of the change.

## Why is this needed?
Link to issue or explain the motivation.

## How was this tested?
Describe testing approach — unit tests, manual testing, etc.

## Screenshots / Recordings
If UI change, include before/after screenshots.

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes (or clearly documented)
```

### Review Process

1. At least 1 maintainer review required
2. All CI checks must pass
3. For domain-specific code (MEP calculations, structural analysis), a domain expert review is required
4. For ML model changes, benchmark comparison required

## Coding Standards

### TypeScript (Web, APIs)

- Strict TypeScript — no `any` types unless absolutely necessary
- ESLint + Prettier enforced via CI
- Prefer functional patterns, avoid classes unless modeling stateful entities
- Use Zod for runtime validation at API boundaries

### Python (ML, Engineering Services)

- Python 3.11+ with type hints
- Black formatter, Ruff linter
- Pydantic for data models
- Pytest for testing

### General

- Write code that reads like documentation — clear names, obvious flow
- No dead code, no commented-out code in commits
- Error messages should help the user fix the problem, not just describe it
- Security: validate all external input, parameterize queries, no secrets in code

## Domain-Specific Contributions

### Engineering Calculations (MEP, Structural)

If you're contributing calculation logic (electrical load, pipe sizing, HVAC tonnage, etc.):

1. **Cite your source** — reference the standard, code, or textbook (e.g., "Per NEC Table 220.12" or "IS 1172:1993")
2. **Include unit tests with known values** — use textbook examples as test cases
3. **Document assumptions** — safety factors, typical vs. worst case, regional defaults
4. **Support multiple standards** — design for pluggable code standards (IEC vs NEC, IS vs IPC)

### Building Code Databases

Building codes vary by country, state, and city. We need contributors to help build region-specific rule sets:

```
data/building-codes/
├── india/
│   ├── national-building-code-2016.json
│   └── states/
│       ├── maharashtra.json
│       └── karnataka.json
├── usa/
│   ├── ibc-2021.json
│   └── states/
│       ├── california.json
│       └── florida.json
└── schema.json  # validation schema for code entries
```

### Material / Product Data

Contribute local material specs:

```json
{
  "name": "Kajaria Eternity Tile",
  "category": "flooring.tile.porcelain",
  "dimensions": { "length_mm": 600, "width_mm": 600, "thickness_mm": 10 },
  "finish": "matte",
  "anti_skid": true,
  "water_absorption_pct": 0.05,
  "breaking_strength_n": 2000,
  "region": "IN",
  "price": { "currency": "INR", "mrp": 85, "unit": "per_sqft" }
}
```

## Reporting Bugs

Use [GitHub Issues](https://github.com/rahuliitk/interiorai/issues/new?template=bug_report.yml) with:

- **Description**: What happened vs. what you expected
- **Steps to Reproduce**: Minimal steps to trigger the bug
- **Environment**: OS, browser, Node version
- **Screenshots/Logs**: If applicable

## Suggesting Features

Use [GitHub Discussions](https://github.com/rahuliitk/interiorai/discussions/categories/ideas) for feature ideas. Describe:

- The problem you're trying to solve
- Your proposed solution
- Alternatives you've considered
- Who benefits (homeowner, designer, contractor, factory?)

## Community

- Be respectful, be patient, be kind
- Help others learn — we come from many disciplines
- No question is too basic — if a carpenter asks about git or a developer asks about plumbing codes, help them out
- Celebrate contributions of all sizes

---

Thank you for helping make professional home design accessible to everyone.
