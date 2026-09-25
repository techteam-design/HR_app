import { describe, expect, it } from "vitest";

import { contentTypeOfKey, isOwnPhotoKey, photoKeyFor } from "@/lib/employees/photo-key";

const MARIA = "11111111-1111-4111-8111-111111111111";
const DANIEL = "22222222-2222-4222-8222-222222222222";
const RANDOM = "33333333-3333-4333-8333-333333333333";

describe("photoKeyFor()", () => {
  it("puts the photo under the employee's own prefix with the right extension", () => {
    expect(photoKeyFor(MARIA, "image/jpeg", RANDOM)).toBe(`employees/${MARIA}/${RANDOM}.jpg`);
    expect(photoKeyFor(MARIA, "image/png", RANDOM)).toBe(`employees/${MARIA}/${RANDOM}.png`);
    expect(photoKeyFor(MARIA, "image/webp", RANDOM)).toBe(`employees/${MARIA}/${RANDOM}.webp`);
  });
});

describe("isOwnPhotoKey()", () => {
  it("accepts a key made for the same employee", () => {
    expect(isOwnPhotoKey(MARIA, photoKeyFor(MARIA, "image/png", RANDOM))).toBe(true);
  });

  it("rejects a key belonging to another employee", () => {
    expect(isOwnPhotoKey(MARIA, photoKeyFor(DANIEL, "image/png", RANDOM))).toBe(false);
    expect(isOwnPhotoKey(DANIEL, photoKeyFor(MARIA, "image/jpeg", RANDOM))).toBe(false);
  });

  it("rejects path tricks and malformed keys", () => {
    for (const key of [
      `employees/${MARIA}/../${DANIEL}/${RANDOM}.jpg`,
      `employees/${MARIA}/${DANIEL}/${RANDOM}.jpg`,
      `employees/${MARIA}/${RANDOM}.gif`,
      `employees/${MARIA}/${RANDOM}.jpg.exe`,
      `employees/${MARIA}/not-a-random-id.jpg`,
      `employees/${MARIA}/${RANDOM}`,
      `/employees/${MARIA}/${RANDOM}.jpg`,
      `other/${MARIA}/${RANDOM}.jpg`,
      "",
    ]) {
      expect(isOwnPhotoKey(MARIA, key), key).toBe(false);
    }
  });
});

describe("contentTypeOfKey()", () => {
  it("maps each extension back to its content type", () => {
    expect(contentTypeOfKey(`employees/${MARIA}/${RANDOM}.jpg`)).toBe("image/jpeg");
    expect(contentTypeOfKey(`employees/${MARIA}/${RANDOM}.png`)).toBe("image/png");
    expect(contentTypeOfKey(`employees/${MARIA}/${RANDOM}.webp`)).toBe("image/webp");
    expect(contentTypeOfKey(`employees/${MARIA}/${RANDOM}.gif`)).toBeUndefined();
  });
});
