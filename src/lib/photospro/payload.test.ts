import assert from "node:assert/strict";
import test from "node:test";
import { decodeImageBase64, matchProductsByTitle, normalizeProductTitle, orderedImages, parsePhotosProBody } from "./payload.ts";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("matches a product title without extra spaces or case differences", () => {
  const products = [
    { id: "a", title: "Olicalm" },
    { id: "b", title: "Oli Calm" },
  ];
  assert.equal(normalizeProductTitle("  OLICalm  "), "olicalm");
  assert.deepEqual(matchProductsByTitle(products, "olicalm").map((product) => product.id), ["a"]);
  assert.deepEqual(matchProductsByTitle(products, "  oli   calm ").map((product) => product.id), ["b"]);
  assert.equal(matchProductsByTitle(products, "חסר").length, 0);
});

test("keeps the primary image first and accepts a bare base64 payload", () => {
  const parsed = parsePhotosProBody({
    title: " Olicalm ",
    price: 80.1,
    currency: "ils",
    image_base64: png.toString("base64"),
    images: [
      { image_base64: png.toString("base64"), position: 1, primary: true },
      { image_base64: Buffer.from("not-an-image-but-unique-payload-aaaaaaaa").toString("base64"), position: 2, primary: false },
    ],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.price, 80.1);
  assert.equal(parsed.value.currency, "ILS");
  assert.equal(parsed.value.images.length, 2);
  assert.equal(orderedImages(parsed.value.images)[0]?.primary, true);
  assert.equal(orderedImages(parsed.value.images)[0]?.position, 1);
});

test("does not invent a product when the title is missing", () => {
  const parsed = parsePhotosProBody({ price: 10, images: [] });
  assert.equal(parsed.ok, false);
});

test("reads a png from base64 without a data prefix", () => {
  const decoded = decodeImageBase64(png.toString("base64"));
  assert.equal(decoded?.contentType, "image/png");
  assert.equal(decoded?.extension, "png");
  assert.equal(decodeImageBase64("aGVsbG8="), null);
});
