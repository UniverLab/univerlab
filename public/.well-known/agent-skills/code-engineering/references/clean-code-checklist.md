# Clean Code Checklist

Pre-submission verification for production-ready code.

---

## Before Writing Code

- [ ] **Understand requirements** — Clarify what the user actually needs
- [ ] **Read existing codebase** — Identify established patterns and conventions
- [ ] **Define scope** — Build only what's needed now (YAGNI)
- [ ] **Identify edge cases** — Think about failure modes upfront

---

## Code Structure

### Functions/Methods
- [ ] **Single Responsibility** — Each function does one thing
- [ ] **Size limit** — ≤ 30 lines per function
- [ ] **Naming** — Explicit, readable names (no acronyms)
- [ ] **Parameters** — ≤ 4 parameters (use objects for more)
- [ ] **Return values** — Clear, documented return types

### Classes
- [ ] **Single Responsibility** — One reason to change
- [ ] **Size limit** — ≤ 200 lines per class
- [ ] **Naming** — Clear, descriptive class names
- [ ] **Cohesion** — Methods belong together logically
- [ ] **Coupling** — Minimal dependencies between classes

### Control Flow
- [ ] **Nesting limit** — ≤ 3 levels of conditional nesting
- [ ] **Guard clauses** — Fail fast with negative conditions
- [ ] **Early returns** — Exit early when possible
- [ ] **Avoid else** — Prefer early returns over else blocks
- [ ] **Ternary operators** — Only for simple conditions

---

## Code Quality

### Naming
- [ ] **Variables** — `customerName` not `cn` or `data`
- [ ] **Functions** — `calculateShippingCost()` not `calc()`
- [ ] **Classes** — `UserRepository` not `UserManager`
- [ ] **Booleans** — `isActive` not `status`
- [ ] **Collections** — `userList` not `users` (if it's a List)

### Error Handling
- [ ] **Explicit errors** — Use specific error types
- [ ] **No swallowed errors** — Don't catch and ignore
- [ ] **Logging** — Log errors with context
- [ ] **Validation** — Validate inputs at boundaries
- [ ] **Fail fast** — Reject invalid state immediately

### Comments
- [ ] **Minimal comments** — Code should be self-documenting
- [ ] **Why not what** — Explain reasoning, not obvious code
- [ ] **TODO markers** — Use TODO for known issues
- [ ] **Avoid redundant** — Don't explain what the code obviously does
- [ ] **Update with code** — Keep comments in sync

---

## Design Principles

### SOLID
- [ ] **SRP** — Single Responsibility Principle
- [ ] **OCP** — Open/Closed Principle (extend, don't modify)
- [ ] **LSP** — Liskov Substitution Principle
- [ ] **ISP** — Interface Segregation Principle
- [ ] **DIP** — Dependency Inversion Principle

### Other Principles
- [ ] **DRY** — Don't Repeat Yourself
- [ ] **KISS** — Keep It Simple, Stupid
- [ ] **YAGNI** — You Aren't Gonna Need It
- [ ] **SoC** — Separation of Concerns
- [ ] **LoD** — Law of Demeter

---

## Testing

- [ ] **Unit tests** — Cover core logic
- [ ] **Edge cases** — Test boundary conditions
- [ ] **Error paths** — Test failure scenarios
- [ ] **Independent** — Tests don't depend on each other
- [ ] **Repeatable** — Same result every time
- [ ] **Fast** — Run quickly

---

## Code Formatting

- [ ] **Formatter applied** — Use language-specific formatter
- [ ] **Consistent indentation** — 2 or 4 spaces (match project)
- [ ] **Line length** — ≤ 120 characters
- [ ] **Imports organized** — Grouped and sorted
- [ ] **Whitespace** — Consistent around operators
- [ ] **Braces** — Consistent style (match project)

---

## Documentation

- [ ] **README updated** — If adding new features
- [ ] **API documentation** — For public methods
- [ ] **Examples** — For complex usage
- [ ] **Changelog** — If significant changes
- [ ] **Version updated** — If releasing

---

## Final Review

- [ ] **Builds successfully** — No compilation errors
- [ ] **Tests pass** — All tests green
- [ ] **No warnings** — Clean build output
- [ ] **Performance** — No obvious bottlenecks
- [ ] **Security** — No hardcoded secrets
- [ ] **Accessibility** — Follows accessibility guidelines
- [ ] **Internationalization** — Ready for i18n if needed
- [ ] **Localization** — Ready for l10n if needed

---

## Commit Checklist

- [ ] **Conventional Commits** — Proper format
- [ ] **Atomic commits** — One logical change per commit
- [ ] **Good message** — Clear, descriptive
- [ ] **Related issues** — References tickets if applicable
- [ ] **Reviewed** — Code reviewed if required
- [ ] **Approved** — Approval obtained if needed

---

## The Rule

> Run this checklist before every commit.
> If anything is unclear or missing, fix it first.
> Quality is everyone's responsibility.
