import { beforeEach, describe, expect, it, vi } from "vitest";

// The self-service photo routes and the shared photo service, with the
// session, database and R2 replaced by mocks. Checks that the employee id
// only ever comes from the session, and that keys under another employee's
// prefix are rejected without touching storage.

const MARIA = "11111111-1111-4111-8111-111111111111";
const DANIEL = "22222222-2222-4222-8222-222222222222";
const RANDOM = "33333333-3333-4333-8333-333333333333";

const auth = vi.hoisted(() => ({ requireApiEmployee: vi.fn() }));
const storage = vi.hoisted(() => ({
  isStorageConfigured: vi.fn(() => true),
  createPresignedUpload: vi.fn(async () => ({ url: "https://r2.example/upload", headers: { "Content-Type": "image/png" } })),
  createPresignedDownload: vi.fn(async (key: string) => `https://r2.example/${key}`),
  getObjectInfo: vi.fn(),
  deleteObject: vi.fn(async () => undefined),
}));
const employees = vi.hoisted(() => ({
  employeeExists: vi.fn(async () => true),
  getEmployeePhotoKey: vi.fn(),
  setEmployeePhotoKey: vi.fn(async () => undefined),
}));

vi.mock("@/server/auth.service", () => auth);
vi.mock("@/lib/storage/r2", () => storage);
vi.mock("@/server/employee.service", () => employees);

const { POST: requestUploadUrl } = await import("@/app/api/me/photo/upload-url/route");
const { POST: confirmOwnPhoto, DELETE: removeOwnPhoto } = await import("@/app/api/me/photo/route");
const { confirmPhotoUpload } = await import("@/server/employee-photo.service");

function jsonRequest(url: string, body: unknown) {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const ownKey = `employees/${MARIA}/${RANDOM}.png`;
const danielsKey = `employees/${DANIEL}/${RANDOM}.png`;

beforeEach(() => {
  vi.clearAllMocks();
  storage.isStorageConfigured.mockReturnValue(true);
  auth.requireApiEmployee.mockResolvedValue({ ok: true, employee: { id: MARIA, role: "employee" } });
  employees.getEmployeePhotoKey.mockResolvedValue(null);
  storage.getObjectInfo.mockResolvedValue({ size: 1000, contentType: "image/png" });
});

describe("POST /api/me/photo/upload-url", () => {
  it("requires update_own_photo", async () => {
    await requestUploadUrl(jsonRequest("http://app/api/me/photo/upload-url", { contentType: "image/png", size: 1000 }));
    expect(auth.requireApiEmployee).toHaveBeenCalledWith("update_own_photo");
  });

  it("ignores an employeeId in the body or query and signs a key under the session employee's prefix", async () => {
    const response = await requestUploadUrl(
      jsonRequest(`http://app/api/me/photo/upload-url?employeeId=${DANIEL}`, {
        employeeId: DANIEL,
        id: DANIEL,
        contentType: "image/png",
        size: 1000,
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { key: string };
    expect(body.key.startsWith(`employees/${MARIA}/`)).toBe(true);
    expect(employees.employeeExists).toHaveBeenCalledWith(MARIA);
    expect(storage.createPresignedUpload).toHaveBeenCalledWith(body.key, "image/png", 1000);
    expect(JSON.stringify(storage.createPresignedUpload.mock.calls)).not.toContain(DANIEL);
  });

  it("rejects a wrong type or an oversized file", async () => {
    const gif = await requestUploadUrl(jsonRequest("http://app/x", { contentType: "image/gif", size: 1000 }));
    expect(gif.status).toBe(400);
    const big = await requestUploadUrl(jsonRequest("http://app/x", { contentType: "image/png", size: 2 * 1024 * 1024 + 1 }));
    expect(big.status).toBe(400);
    expect(storage.createPresignedUpload).not.toHaveBeenCalled();
  });

  it("returns 503 when storage is not configured", async () => {
    storage.isStorageConfigured.mockReturnValue(false);
    const response = await requestUploadUrl(jsonRequest("http://app/x", { contentType: "image/png", size: 1000 }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Photo storage is not configured yet" });
  });

  it("passes on the 401/403 from the access check", async () => {
    auth.requireApiEmployee.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    const response = await requestUploadUrl(jsonRequest("http://app/x", { contentType: "image/png", size: 1000 }));
    expect(response.status).toBe(401);
  });
});

describe("POST /api/me/photo", () => {
  it("saves the photo for the session employee, ignoring any employeeId sent", async () => {
    const response = await confirmOwnPhoto(
      jsonRequest(`http://app/api/me/photo?employeeId=${DANIEL}`, { key: ownKey, employeeId: DANIEL }),
    );
    expect(response.status).toBe(200);
    expect(auth.requireApiEmployee).toHaveBeenCalledWith("update_own_photo");
    expect(employees.setEmployeePhotoKey).toHaveBeenCalledWith(MARIA, ownKey);
  });

  it("rejects another employee's key without reading, saving or deleting anything", async () => {
    const response = await confirmOwnPhoto(jsonRequest("http://app/api/me/photo", { key: danielsKey }));
    expect(response.status).toBe(400);
    expect(storage.getObjectInfo).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(employees.setEmployeePhotoKey).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/me/photo", () => {
  it("removes only the session employee's photo, whatever the URL says", async () => {
    employees.getEmployeePhotoKey.mockResolvedValue(ownKey);
    const response = await removeOwnPhoto();
    expect(response.status).toBe(200);
    expect(employees.getEmployeePhotoKey).toHaveBeenCalledWith(MARIA);
    expect(employees.setEmployeePhotoKey).toHaveBeenCalledWith(MARIA, null);
    expect(storage.deleteObject).toHaveBeenCalledWith(ownKey);
  });

  it("succeeds without changes when there is no photo", async () => {
    const response = await removeOwnPhoto();
    expect(response.status).toBe(200);
    expect(employees.setEmployeePhotoKey).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it("returns 503 when storage is not configured", async () => {
    storage.isStorageConfigured.mockReturnValue(false);
    expect((await removeOwnPhoto()).status).toBe(503);
  });
});

describe("confirmPhotoUpload() key checks", () => {
  it("rejects a key belonging to another employee", async () => {
    expect(await confirmPhotoUpload(MARIA, danielsKey)).toMatchObject({ ok: false, status: 400 });
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it("deletes its own new object when the upload fails the size or type check, and keeps the old photo", async () => {
    storage.getObjectInfo.mockResolvedValue({ size: 3 * 1024 * 1024, contentType: "image/png" });
    expect(await confirmPhotoUpload(MARIA, ownKey)).toMatchObject({ ok: false, status: 400 });
    expect(storage.deleteObject).toHaveBeenCalledWith(ownKey);
    expect(employees.setEmployeePhotoKey).not.toHaveBeenCalled();
  });

  it("replaces the previous photo and deletes its object", async () => {
    const oldKey = `employees/${MARIA}/44444444-4444-4444-8444-444444444444.jpg`;
    employees.getEmployeePhotoKey.mockResolvedValue(oldKey);
    expect(await confirmPhotoUpload(MARIA, ownKey)).toMatchObject({ ok: true });
    expect(employees.setEmployeePhotoKey).toHaveBeenCalledWith(MARIA, ownKey);
    expect(storage.deleteObject).toHaveBeenCalledWith(oldKey);
  });
});
