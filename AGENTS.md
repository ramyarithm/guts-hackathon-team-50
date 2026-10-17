# AGENTS.md

## Repository status (read first)

This repo is currently **empty**. As of the initial state, the only tracked file is
`.gitignore`. There is no `src/`, no `package.json`, no `tsconfig.json`, no test runner,
and no build/lint configuration.

Do not assume a project layout exists. Do not write code that imports modules that aren't
there, and do not report build or test results — there is nothing to run yet.

## Stack

Intended stack is **Node / TypeScript** (team-confirmed).

`.gitignore` also carries Python entries (`__pycache__/`, `*.py[cod]`, `.venv/`, `venv/`).
These are generic boilerplate, **not** an indication that Python is used. Ignore them.

## Environment variables

The `.gitignore` pattern is:

```
.env
.env.*
!.env.example
```

Consequences to respect:

- `.env` and any `.env.*` variant are gitignored — never commit real secrets or local values.
- `.env.example` is explicitly **un**-ignored and is meant to be committed. It is the
  template that documents which variables the project expects.
- When adding a new required env var, add it to `.env.example` with a safe placeholder
  value. Do not commit a real `.env`.

## TODO: fill this in once the project is scaffolded

This file is intentionally mostly negative information right now. Replace the sections
below with verified facts as the codebase lands — do not guess them.

- **Install / setup:** exact command(s) and any prerequisites (Node version, package manager).
- **Commands:** dev server, build, typecheck, lint, test — as real script names from
  `package.json`. Do not invent plausible-sounding scripts; an agent will run them and fail.
- **Entry points:** the actual source entry file(s) and the app's execution flow.
- **Architecture:** package/module boundaries and what owns each top-level directory.
- **Tests:** how to run a single test or focused subset, any fixtures or snapshots,
  required external services, and which suites are slow or flaky.
- **Toolchain quirks:** codegen or generated files that must not be hand-edited, and whether
  generated output is committed.
- **Project description:** what the project does and what it is for.