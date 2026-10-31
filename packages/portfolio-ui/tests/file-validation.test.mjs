import test from "node:test";
import assert from "node:assert/strict";
import { matchesUploadAccept, validateUploadSelection } from "../src/file-validation.ts";

const pdf = { name: "evidence.PDF", type: "application/pdf", size: 800 };
const image = { name: "photo.webp", type: "image/webp", size: 1000 };

test("matches extensions case-insensitively and MIME families", () => {
  assert.equal(matchesUploadAccept(pdf, ".pdf"), true);
  assert.equal(matchesUploadAccept(image, "image/*"), true);
  assert.equal(matchesUploadAccept(pdf, "image/*"), false);
  assert.equal(matchesUploadAccept(pdf, ""), true);
});

test("rejects an empty, over-limit or unsupported selection", () => {
  assert.match(validateUploadSelection([]), /Choose/);
  assert.match(validateUploadSelection([pdf, image]), /only one/);
  assert.match(validateUploadSelection([pdf], { maxBytes: 10 }), /size limit/);
  assert.match(validateUploadSelection([pdf], { accept: "image/*" }), /unsupported/);
});

test("accepts a valid multiple selection", () => {
  assert.equal(validateUploadSelection([pdf, image], { multiple: true, accept: ".pdf,image/*", maxBytes: 2000 }), null);
});

test("rejects invalid file sizes", () => {
  assert.match(validateUploadSelection([{ ...pdf, size: Number.NaN }]), /invalid size/);
  assert.match(validateUploadSelection([{ ...pdf, size: -1 }]), /invalid size/);
});
