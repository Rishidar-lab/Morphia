import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest doesn't run with `globals: true` here, so @testing-library/react's
// automatic post-test cleanup (which detects a global `afterEach`) never
// fires — without this, every render in a test file stacks up in the same
// document, and later tests fail with "multiple elements found".
afterEach(() => {
  cleanup();
});
