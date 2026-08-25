# Architecture Decision Records (ADR)

Templates and examples for documenting architectural decisions.

---

## What is an ADR?

An Architecture Decision Record (ADR) captures an important architectural decision along with its context and consequences.

**Benefits:**
- Preserves decision rationale over time
- Helps onboard new team members
- Prevents rehashing old decisions
- Provides audit trail for compliance

---

## ADR Template

```markdown
# [Short title is a few words]

## Status

[Proposed | Accepted | Deprecated | Superseded by [ADR-0005](0005-example.md)]

## Context

[Describe the problem space, the forces at play, including technological, political, social, and project local. These forces are probably in tension and should be called out as such. The language in this section is value-neutral.]

## Decision

[This is the meat of the ADR. Describe the response to these forces. It is written in full sentences, with active voice. "We will ..."]

## Consequences

[Describe the resulting context, after applying the decision. All consequences should be listed here, not just the "positive" ones.]

## Alternatives Considered

[What other options were considered? Why were they rejected?]

## Related

- [ADR-0001](0001-example.md) — Previous decision this builds on
- [ADR-0003](0003-example.md) — Related decision

## Notes

[Any additional context, links to discussions, etc.]
```

---

## Example ADRs

### ADR-0001: Use Microservices Architecture

**Status:** Accepted

**Context:**
- Monolithic application becoming difficult to maintain
- Team growing from 5 to 20 developers
- Need independent deployment of features
- Different scaling requirements for different components

**Decision:**
- Adopt microservices architecture
- Each service owns its own database
- Services communicate via REST APIs
- Use API Gateway pattern for client communication

**Consequences:**
- **Positive:** Independent deployment, technology diversity, better scaling
- **Negative:** Increased operational complexity, distributed transaction challenges
- **Neutral:** Need to implement service discovery, monitoring, logging

**Alternatives Considered:**
1. **Modular Monolith** — Easier to start but harder to scale team
2. **Serverless** — Too early in the serverless ecosystem
3. **SOA** — More enterprise-focused than needed

---

### ADR-0002: Use PostgreSQL for Primary Database

**Status:** Accepted

**Context:**
- Need relational database with strong ACID guarantees
- Require JSON support for flexible schemas
- Team familiar with SQL
- Budget constraints

**Decision:**
- Use PostgreSQL 14+ as primary database
- Use JSONB for flexible data storage
- Implement connection pooling
- Use migrations for schema changes

**Consequences:**
- **Positive:** Strong community, good performance, JSON support
- **Negative:** Operational overhead for backups and scaling
- **Neutral:** Need to monitor query performance

**Alternatives Considered:**
1. **MySQL** — Similar but less advanced JSON support
2. **MongoDB** — No ACID transactions at the time
3. **CockroachDB** — Too expensive for current budget

---

### ADR-0003: Use React for Frontend

**Status:** Accepted

**Context:**
- Need modern frontend framework
- Team has JavaScript experience
- Require good ecosystem and community
- Need component-based architecture

**Decision:**
- Use React 18+ with TypeScript
- Use functional components with hooks
- Use Context API for state management
- Use React Router for navigation

**Consequences:**
- **Positive:** Large ecosystem, good performance, strong typing
- **Negative:** Learning curve for hooks, bundle size concerns
- **Neutral:** Need to implement testing strategy

**Alternatives Considered:**
1. **Vue.js** — Simpler but smaller ecosystem
2. **Angular** — More opinionated, steeper learning curve
3. **Svelte** — Newer, less proven

---

## ADR Workflow

### 1. Propose
- Create ADR with "Proposed" status
- Describe context and alternatives
- Present to team for discussion

### 2. Review
- Team discusses pros and cons
- Consider alternatives
- Assess consequences
- May request changes

### 3. Decide
- Team reaches consensus
- Update status to "Accepted"
- Implement the decision

### 4. Maintain
- Update ADR if new information emerges
- Mark as "Deprecated" if no longer relevant
- Reference in code and documentation

---

## ADR Organization

```
adrs/
├── 0001-use-microservices.md
├── 0002-use-postgresql.md
├── 0003-use-react.md
└── README.md  # Index of all ADRs
```

---

## ADR Index (README.md)

```markdown
# Architecture Decisions

| Number | Title | Status | Date |
|--------|-------|--------|------|
| [ADR-0001](0001-use-microservices.md) | Use Microservices Architecture | Accepted | 2023-01-15 |
| [ADR-0002](0002-use-postgresql.md) | Use PostgreSQL for Primary Database | Accepted | 2023-01-16 |
| [ADR-0003](0003-use-react.md) | Use React for Frontend | Accepted | 2023-01-17 |
```

---

## ADR Tools

### MADR (Markdown ADR)
Simple tool for managing ADRs:
```bash
npm install -g madge
madge init  # Initialize ADR structure
madge new "Use Kafka for event streaming"  # Create new ADR
```

### adr-tools
More comprehensive ADR tool:
```bash
npm install -g adr-tools
adr init docs/adr
adr new Implement CI/CD pipeline
```

---

## ADR Best Practices

### Do's
- **Be concise** — Focus on key information
- **Be specific** — Avoid vague language
- **Document alternatives** — Show you considered options
- **Update status** — Keep ADRs current
- **Reference in code** — Link ADRs to implementation

### Don'ts
- **Don't over-document** — Not every decision needs an ADR
- **Don't be dogmatic** — ADRs can be changed
- **Don't duplicate** — Reference existing documentation
- **Don't neglect** — Review ADRs periodically

---

## When to Write an ADR

✅ **Write an ADR when:**
- Decision has long-term impact
- Multiple reasonable alternatives exist
- Decision affects multiple teams
- Significant architectural change
- Compliance or regulatory requirements

❌ **Don't write an ADR when:**
- Decision is trivial or temporary
- Only one obvious solution exists
- Decision affects only one component
- Implementation detail, not architectural

---

## ADR Maintenance

### Review Schedule
- **Quarterly** — Review all active ADRs
- **Annually** — Archive deprecated ADRs
- **On change** — Update related ADRs

### Versioning
- Use semantic versioning for ADR format
- Don't version individual ADRs (they're immutable)
- Create new ADR if decision changes significantly

---

## The Rule

> Document architectural decisions as you make them.
> Keep ADRs concise, current, and connected to code.
> Review periodically to ensure they still make sense.
> When in doubt, write it down — future you will thank you.
