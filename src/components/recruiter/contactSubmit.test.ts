import test from "node:test";
import assert from "node:assert/strict";
import { buildPayload, isSuccess, validateContact } from "./contactSubmit";

const good = { name: "Asha", email: "asha@example.com", message: "Hello, we have an internship." };

test("a good form has no errors", () => assert.deepEqual(validateContact(good), {}));
test("required fields", () => {
  const e = validateContact({ name: " ", email: "", message: "" });
  assert.deepEqual(Object.keys(e).sort(), ["email", "message", "name"]);
});
test("email must look like an email", () => assert.ok(validateContact({ ...good, email: "asha@" }).email));
test("message needs at least 10 characters", () => {
  assert.ok(validateContact({ ...good, message: "too short" }).message);
  assert.equal(validateContact({ ...good, message: "0123456789" }).message, undefined);
});
test("payload carries key, subject and the honeypot", () => {
  const p = buildPayload("K", { ...good, name: " Asha " });
  assert.equal(p.access_key, "K");
  assert.equal(p.name, "Asha");
  assert.equal(p.subject, "Portfolio message from Asha");
  assert.equal(p.botcheck, false);
});
test("success needs ok and success:true", () => {
  assert.equal(isSuccess(true, { success: true }), true);
  assert.equal(isSuccess(true, { success: false }), false);
  assert.equal(isSuccess(false, { success: true }), false);
  assert.equal(isSuccess(true, null), false);
});
