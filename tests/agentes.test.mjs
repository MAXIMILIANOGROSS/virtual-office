import test from "node:test";
import assert from "node:assert/strict";
import { AGENTES, promptDe } from "../src/lib/oficina/agentes.ts";

test("hay 43 agentes con ids únicos", () => {
  assert.equal(AGENTES.length, 43);
  assert.equal(new Set(AGENTES.map((a) => a.id)).size, 43);
});

test("los prompts son genéricos (sin proyecto concreto)", () => {
  for (const a of AGENTES) {
    const p = promptDe(a);
    assert.ok(p.length > 50, a.id);
    assert.ok(!/island|corralejo/i.test(p), a.id);
  }
});
