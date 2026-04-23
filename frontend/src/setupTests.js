import { cleanup } from './test/testUtils';
import { resetTestDoubles } from './test/moduleMocks';

global.IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = jest.fn(() => 'blob:mock');
}

if (!window.URL.revokeObjectURL) {
  window.URL.revokeObjectURL = jest.fn();
}

Object.defineProperty(window.navigator, 'clipboard', {
  configurable: true,
  value: {
    writeText: jest.fn(),
  },
});

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  resetTestDoubles();
  localStorage.clear();
  jest.clearAllTimers();
  jest.useRealTimers();
  console.error.mockRestore();
});
