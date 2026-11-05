// node --experimental-strip-types --test run-state.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { runState } from "./run-state.ts";

test("maps the submit button label to a run state", () => {
  assert.equal(runState("Stop run"), "stop");
  assert.equal(runState("Steer current run (Enter), Ctrl + Enter to queue"), "steer");
  assert.equal(runState("Submit (Enter)"), null);
  assert.equal(runState(null), null);
});
