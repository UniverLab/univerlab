# Testing Guide for UniverLab

## 🧪 Test Suite Overview

UniverLab includes a comprehensive test suite that validates the core functionality of the project. The tests are written using **Jest** and provide **97.14% code coverage** for the critical business logic.

## 📋 Test Structure

```
src/__tests__/
├── experiments.test.ts  # Tests for experiment registry
├── i18n.test.ts        # Tests for internationalization
└── utils.test.ts       # Tests for utility functions
```

## 🚀 Running Tests

### Basic Test Execution
```bash
npm test
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

## 📊 Test Coverage

- **Total Coverage**: 97.14%
- **Statements**: 97.14%
- **Branches**: 90%
- **Functions**: 100%
- **Lines**: 96.42%

### Coverage Breakdown

| File | Statements | Branches | Functions | Lines |
|------|-----------|----------|-----------|-------|
| `src/lib/experiments.ts` | 100% | 100% | 100% | 100% |
| `src/i18n/en.ts` | 100% | 100% | 100% | 100% |
| `src/i18n/es.ts` | 100% | 100% | 100% | 100% |
| `src/i18n/index.ts` | 100% | 87.5% | 100% | 100% |

## 🧪 Test Categories

### 1. Experiment Registry Tests
**File**: `src/__tests__/experiments.test.ts`
**Tests**: 13 tests

Validates:
- ✅ Experiment data structure and required fields
- ✅ Unique experiment IDs and numbers
- ✅ Valid status values (`active`, `beta`, `research`)
- ✅ Valid GitHub URLs and install commands
- ✅ Background theme validation
- ✅ `byId()` function behavior

### 2. Internationalization Tests
**File**: `src/__tests__/i18n.test.ts`
**Tests**: 15 tests

Validates:
- ✅ English and Spanish dictionary structure
- ✅ Parity between language files
- ✅ Required sections in both languages
- ✅ Experiment data completeness
- ✅ Home section structure (hero, senses, etc.)

### 3. Utility Function Tests
**File**: `src/__tests__/utils.test.ts`
**Tests**: 7 tests

Validates:
- ✅ `getLang()` - Language detection from URLs
- ✅ `localizePath()` - Path localization
- ✅ `switchLangPath()` - Language switching
- ✅ `useTranslations()` - Translation lookup

## 🔧 Test Configuration

### Jest Configuration
**File**: `jest.config.cjs`

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\.(ts|tsx)$': 'ts-jest',
  },
  testMatch: ['**/?(*.)+(spec|test).+(ts|tsx|js)'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
}
```

### TypeScript Configuration
**File**: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "types": ["jest"],
    "jsx": "preserve",
    "lib": ["DOM", "DOM.Iterable", "ESNext"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

## 📈 Coverage Reports

After running `npm run test:coverage`, you'll find:

- **HTML Report**: `coverage/lcov-report/index.html` (interactive)
- **LCOV Data**: `coverage/lcov.info` (for CI integration)
- **Clover XML**: `coverage/clover.xml` (for other tools)
- **Text Summary**: Displayed in console

## 🎯 What's Tested

### ✅ Covered
- Experiment registry data validation
- Internationalization system
- Utility functions
- Language detection and switching
- Data structure validation

### ⚠️ Not Covered (Expected)
- Astro components (require Astro environment)
- GitHub API integration (requires environment variables)
- Canvas rendering (requires DOM)
- Content collections (require Astro)

## 🔄 Continuous Integration

Add this to your CI configuration:

```yaml
- name: Run tests
  run: npm test

- name: Check coverage
  run: npm run test:coverage
```

## 📝 Test Writing Guidelines

### Adding New Tests

1. **Location**: Place test files in `src/__tests__/`
2. **Naming**: Use `*.test.ts` suffix
3. **Structure**: Follow the existing pattern

### Example Test

```typescript
import { someFunction } from '../path/to/module';

describe('someFunction', () => {
  it('should do something', () => {
    const result = someFunction(input);
    expect(result).toBe(expected);
  });

  it('should handle edge cases', () => {
    expect(() => someFunction(invalidInput)).toThrow();
  });
});
```

## 🎓 Best Practices

1. **Test behavior, not implementation**
2. **Keep tests focused and fast**
3. **Use descriptive test names**
4. **Test edge cases and error conditions**
5. **Maintain high coverage for critical paths**

## 🔗 Related Documentation

- [Jest Documentation](https://jestjs.io/)
- [TypeScript Testing](https://www.typescriptlang.org/docs/handbook/typescript-tooling.html)
- [Astro Testing Guide](https://docs.astro.build/en/guides/testing/)

## 📊 Coverage Badge

```markdown
[![Test Coverage](https://img.shields.io/badge/test_coverage-97.14%25-brightgreen)](coverage/lcov-report/index.html)
```

The test suite provides confidence that the core functionality of UniverLab works as expected and helps prevent regressions during development.