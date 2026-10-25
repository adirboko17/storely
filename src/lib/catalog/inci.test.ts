import assert from "node:assert/strict";
import test from "node:test";
import { parseInciPaste, takeInciPaste } from "./inci.ts";

const SAMPLE = "Ingredients: Prunus Amygdalus Dulcis (Sweet Almond) Oil, Olea Europaea (Olive) Fruit Oil, Simmondsia Chinesis (Jojoba) Seeds Oil, Lavandula Angustifolia Oil, Tocopheryl Acetate, Helianthus Annuus Seed Oil, Calandula Officinalise Flower Extract.";

test("splits a pasted ingredients line and drops the label and the final period", () => {
  assert.deepEqual(parseInciPaste(SAMPLE), [
    "Prunus Amygdalus Dulcis (Sweet Almond) Oil",
    "Olea Europaea (Olive) Fruit Oil",
    "Simmondsia Chinesis (Jojoba) Seeds Oil",
    "Lavandula Angustifolia Oil",
    "Tocopheryl Acetate",
    "Helianthus Annuus Seed Oil",
    "Calandula Officinalise Flower Extract",
  ]);
});

test("keeps commas inside parentheses and (and) blends as one ingredient", () => {
  assert.deepEqual(parseInciPaste("Foo (Bar, Baz) Oil, Glyceryl Stearate (and) PEG-100 Stearate, Aqua"), [
    "Foo (Bar, Baz) Oil",
    "Glyceryl Stearate (and) PEG-100 Stearate",
    "Aqua",
  ]);
});

test("splits lines, semicolons, bullets, spaced slashes, and a trailing and", () => {
  assert.deepEqual(parseInciPaste("1. Aqua\n2) Glycerin\n• Tocopherol; Parfum / Limonene and Linalool"), [
    "Aqua",
    "Glycerin",
    "Tocopherol",
    "Parfum",
    "Limonene",
    "Linalool",
  ]);
});

test("does not split a slash that is part of the INCI name", () => {
  assert.deepEqual(parseInciPaste("Coco-Caprylate/Caprate, CI 77491"), ["Coco-Caprylate/Caprate", "CI 77491"]);
});

test("drops duplicates inside the paste and ingredients already on the product", () => {
  const result = takeInciPaste(["Aqua"], "רכיבים: Aqua, Aqua, Glycerin, Glycerin", 60);
  assert.deepEqual(result.added, ["Glycerin"]);
  assert.equal(result.skipped, 1);
  assert.equal(result.overflow, 0);
});

test("stops at the remaining room in the list", () => {
  const result = takeInciPaste([], "Aqua, Glycerin, Tocopherol", 2);
  assert.deepEqual(result.added, ["Aqua", "Glycerin"]);
  assert.equal(result.overflow, 1);
});
