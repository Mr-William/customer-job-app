import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  jobPhotoExtension,
  jobPhotoValidationError,
  MAX_JOB_PHOTO_BYTES,
  OPTIMISED_JOB_PHOTO_TARGET_BYTES,
  optimisedPhotoDimensions,
  optimiseJobPhoto,
  updateJobPhoto,
  deleteJobPhoto,
  uploadJobPhoto,
} from "../src/lib/jobPhotos.ts";

const originalFetch = globalThis.fetch;
const originalDocument = globalThis.document;
const originalImage = globalThis.Image;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalImage === undefined) delete globalThis.Image;
  else globalThis.Image = originalImage;
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
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

test("scales large camera images down proportionally without upscaling small images", () => {
  assert.deepEqual(optimisedPhotoDimensions(6000, 4000), { width: 2560, height: 1707 });
  assert.deepEqual(optimisedPhotoDimensions(4000, 6000), { width: 1707, height: 2560 });
  assert.deepEqual(optimisedPhotoDimensions(1200, 800), { width: 1200, height: 800 });
});

test("leaves originals unchanged when browser optimisation is unavailable", async () => {
  const original = jpeg();
  assert.equal(await optimiseJobPhoto(original), original);
});

test("targets less than Nginx's default request limit", () => {
  assert.ok(OPTIMISED_JOB_PHOTO_TARGET_BYTES < 1024 * 1024);
});

test("adaptively lowers compression quality until the photo fits the proxy-safe target", async () => {
  const qualities = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage() {}, fillRect() {}, fillStyle: "" }),
    toBlob(callback, type, quality) {
      qualities.push(quality);
      const size = quality >= 0.72 ? 2 * 1024 * 1024 : 800 * 1024;
      callback(new Blob([new Uint8Array(size)], { type }));
    },
  };
  globalThis.document = { createElement: () => canvas };
  globalThis.Image = class {
    set src(_value) {
      this.naturalWidth = 6000;
      this.naturalHeight = 4000;
      queueMicrotask(() => this.onload());
    }
  };
  URL.createObjectURL = () => "blob:test-photo";
  URL.revokeObjectURL = () => {};

  const result = await optimiseJobPhoto(jpeg(3 * 1024 * 1024));
  assert.equal(result.size, 800 * 1024);
  assert.equal(result.type, "image/jpeg");
  assert.deepEqual(qualities, [0.82, 0.72, 0.62]);
  assert.equal(canvas.width, 2560);
  assert.equal(canvas.height, 1707);
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

test("posts a title and description with the photo", async () => {
  let body;
  globalThis.fetch = async (_url, options) => {
    body = options.body;
    return Response.json({ photo: savedPhoto }, { status: 201 });
  };

  await uploadJobPhoto(7, jpeg(), { title: "New boiler", description: "Installed in the basement" });
  assert.equal(body.get("title"), "New boiler");
  assert.equal(body.get("description"), "Installed in the basement");
  assert.equal(body.get("comment"), "Installed in the basement");
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

  await assert.rejects(uploadJobPhoto(7, jpeg(2 * 1024 * 1024), ""), (error) => {
    assert.match(error.message, /optimised 2\.0 MB upload was rejected by the web server/);
    assert.match(error.message, /client_max_body_size 20m/);
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

test("updates photo title and description", async () => {
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return Response.json({ photo: { ...savedPhoto, title: "Updated", description: "New details" } });
  };

  const result = await updateJobPhoto(7, "photo-1", { title: "Updated", description: "New details" });
  assert.equal(request.url, "/api/jobs/7/photos/photo-1");
  assert.equal(request.options.method, "PATCH");
  assert.deepEqual(JSON.parse(request.options.body), { title: "Updated", description: "New details" });
  assert.equal(result.title, "Updated");
});

test("deletes a photo without trying to parse the empty success response", async () => {
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  };

  await deleteJobPhoto(7, "photo-1");
  assert.equal(request.url, "/api/jobs/7/photos/photo-1");
  assert.equal(request.options.method, "DELETE");
});
