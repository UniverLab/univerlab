# Coverage Report for UniverLab

## Summary
- **Total Coverage**: 97.14%
- **Statements**: 97.14%
- **Branches**: 90%
- **Functions**: 100%
- **Lines**: 96.42%

## Test Results
✅ **35 tests passing** across 3 test suites

## Covered Files

### 📁 i18n (100% coverage)
- `en.ts`: 100% statements, 100% branches, 100% functions, 100% lines
- `es.ts`: 100% statements, 100% branches, 100% functions, 100% lines
- `index.ts`: 100% statements, 87.5% branches, 100% functions, 100% lines

### 📁 lib (93.75% coverage)
- `experiments.ts`: 100% statements, 100% branches, 100% functions, 100% lines
- `banners.ts`: 0% statements (not tested - contains only data)

## Test Suites

### 1. **experiments.test.ts** (13 tests)
Tests the core experiment registry:
- ✅ Validates experiment data structure
- ✅ Checks for unique IDs and numbers
- ✅ Tests the `byId()` function
- ✅ Validates install commands
- ✅ Verifies background themes

### 2. **i18n.test.ts** (15 tests)
Tests internationalization system:
- ✅ Validates English dictionary structure
- ✅ Validates Spanish dictionary structure
- ✅ Ensures parity between languages
- ✅ Checks experiment data in both languages
- ✅ Validates home section structure

### 3. **utils.test.ts** (7 tests)
Tests utility functions:
- ✅ `getLang()` function for language detection
- ✅ `localizePath()` for path localization
- ✅ `switchLangPath()` for language switching
- ✅ `useTranslations()` for translation lookup

## Coverage Details

### High Coverage Areas (100%)
- Experiment registry validation
- Internationalization data structure
- Utility functions
- Language detection and switching

### Partial Coverage Areas
- `index.ts` i18n functions: 87.5% branch coverage (one edge case not covered)

### Untested Files (Expected)
- `content.config.ts`: Astro content configuration (requires Astro environment)
- `contributors.ts`: GitHub API integration (requires environment variables)
- `backgrounds.ts`: Canvas rendering (requires DOM environment)
- Astro components and pages (UI testing would require different approach)

## Recommendations

1. **Current Status**: Excellent coverage for core business logic
2. **Next Steps**:
   - Consider adding integration tests for Astro components
   - Add end-to-end tests for critical user flows
   - Test edge cases for language switching
   - Add tests for error conditions in utility functions

## How to Run Tests

```bash
# Run all tests
npm test

# Run tests with watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Coverage Badge

```markdown
[![Test Coverage](https://img.shields.io/badge/test_coverage-97.14%25-brightgreen)](coverage/lcov-report/index.html)
```

## Coverage Report Location
- HTML Report: `coverage/lcov-report/index.html`
- LCOV Data: `coverage/lcov.info`
- Clover XML: `coverage/clover.xml`

The coverage report shows that the core business logic of UniverLab is well-tested, with comprehensive validation of the experiment registry, internationalization system, and utility functions.