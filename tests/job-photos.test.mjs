import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  jobPhotoExtension,
  jobPhotoValidationError,
  MAX_JOB_PHOTO_BYTES,
  uploadJobPhoto,
} from "../src/lib/jobPhotos.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jpeg(size = 128) {
  return new File([new Uint8Array(size)], "job.jpg", { type: "image/jpeg" });
}

const savedPhoto = {
  id: "photo-1",
  url: "/api/jobs/7/photos/photo-1",
  comment: "Finished repair",
  createdAt: "2026-11-10T12:00:00.000Z",
};

test("accepts supported image formats through the 15 MB limit", () => {
  assert.equal(jobPhotoValidationError(jpeg(MAX_JOB_PHOTO_BYTES)), null);
  assert.equal(jobPhotoExtension("image/heic"), ".heic");
  assert.equal(jobPhotoExtension("IMAGE/JPEG"), ".jpg");
});

test("rejects oversized and unsupported photos", () => {
  assert.match(jobPhotoValidationError(jpeg(MAX_JOB_PHOTO_BYTES + 1)), /15 MB/);
  assert.match(jobPhotoValidationError(new File(["text"], "notes.txt", { type: "text/plain" })), /Supported formats/);
});

test("posts the photo and comment as multipart form data", async () => {
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return Response.json({ photo: savedPhoto }, { status: 201 });
  };

  const result = await uploadJobPhoto(7, jpeg(), "Finished repair");

  assert.deepEqual(result, savedPhoto);
  assert.equal(request.url, "/api/jobs/7/photos");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.body.get("comment"), "Finished repair");
  assert.equal(request.options.body.get("photo").name, "job.jpg");
  assert.equal(request.options.headers, undefined);
});

test("rejects an oversized photo without making a network request", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return Response.json({});
  };

  await assert.rejects(uploadJobPhoto(7, jpeg(MAX_JOB_PHOTO_BYTES + 1), ""), /15 MB/);
  assert.equal(called, false);
});

test("preserves JSON errors returned by the upload API", async () => {
  globalThis.fetch = async () => Response.json({ error: "The server could not store the photo." }, { status: 500 });
  await assert.rejects(uploadJobPhoto(7, jpeg(), ""), /could not store the photo/);
});

test("explains an Nginx 413 HTML response instead of reporting a network error", async () => {
  globalThis.fetch = async () => new Response("<html>413 Request Entity Too Large</html>", {
    status: 413,
    headers: { "Content-Type": "text/html" },
  });

  await assert.rejects(uploadJobPhoto(7, jpeg(), ""), (error) => {
    assert.match(error.message, /rejected as too large/);
    assert.doesNotMatch(error.message, /Network error/);
    return true;
  });
});

test("handles other non-JSON proxy errors without calling them network failures", async () => {
  globalThis.fetch = async () => new Response("Bad Gateway", { status: 502 });
  await assert.rejects(uploadJobPhoto(7, jpeg(), ""), /server returned 502/);
});

test("uses the network error only when the request itself fails", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(uploadJobPhoto(7, jpeg(), ""), /Network error while saving photo/);
});
