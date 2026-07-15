// jest.setup.cjs
const { default: jestDom } = require('@testing-library/jest-dom');

// Mock Astro global
global.Astro = {
  url: new URL('http://localhost'),
  site: new URL('https://univerlab.org'),
  request: {
    headers: new Headers(),
  },
  params: {},
  props: {},
};