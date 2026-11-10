export const MAX_JOB_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_JOB_PHOTO_DIMENSION = 2560;

export interface JobPhoto {
  id: string;
  url: string;
  title: string;
  description: string;
  /** Legacy alias retained for photos uploaded before title/description support. */
  comment: string;
  createdAt: string;
  updatedAt?: string;
}

export interface JobPhotoDetails {
  title?: string;
  description?: string;
}

const extensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/gif": ".gif",
};

export function jobPhotoExtension(mimeType: string): string | undefined {
  return extensions[mimeType.toLowerCase()];
}

export function jobPhotoValidationError(file: Pick<File, "size" | "type">): string | null {
  if (!jobPhotoExtension(file.type)) {
    return "Supported formats: JPEG, PNG, WebP, HEIC, and GIF.";
  }
  if (file.size > MAX_JOB_PHOTO_BYTES) {
    return "The photo is still too large after optimisation. Choose an image up to 15 MB.";
  }
  return null;
}

export function optimisedPhotoDimensions(width: number, height: number, maxDimension = MAX_JOB_PHOTO_DIMENSION) {
  const scale = Math.min(1, maxDimension / width, maxDimension / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The browser could not decode this image."));
    };
    image.src = url;
  });
}

/**
 * Resize and compress camera images before they use bandwidth or server storage.
 * If browser decoding is unavailable (some HEIC browsers) or compression would
 * enlarge the file, the original is retained and normal validation still applies.
 */
export async function optimiseJobPhoto(file: File): Promise<File> {
  // Keep animated GIFs intact. Node tests and non-browser callers have no canvas.
  if (file.type === "image/gif" || typeof document === "undefined") return file;

  try {
    const image = await loadImage(file);
    const { width, height } = optimisedPhotoDimensions(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, width, height);

    const outputType = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, outputType, 0.85));
    if (!blob || blob.size >= file.size) return file;

    const extension = jobPhotoExtension(outputType) || ".jpg";
    const name = file.name.replace(/\.[^.]+$/, "") + extension;
    return new File([blob], name, { type: outputType, lastModified: Date.now() });
  } catch {
    return file;
  }
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  try {
    const data = await response.json();
    if (data?.error) return new Error(data.error);
  } catch {
    if (response.status === 413) {
      return new Error("The upload was rejected as too large. Choose a smaller image, or ask the administrator to check the server's upload limit.");
    }
  }
  return new Error(`${fallback} (server returned ${response.status}). Please try again.`);
}

/** Optimise and upload a job photo, turning proxy/API failures into useful UI errors. */
export async function uploadJobPhoto(
  jobId: number,
  originalFile: File,
  details: JobPhotoDetails | string = {},
): Promise<JobPhoto> {
  if (!jobPhotoExtension(originalFile.type)) {
    throw new Error(jobPhotoValidationError(originalFile) || "Unsupported photo format.");
  }

  const file = await optimiseJobPhoto(originalFile);
  const validationError = jobPhotoValidationError(file);
  if (validationError) throw new Error(validationError);

  const { title = "", description = "" } = typeof details === "string" ? { description: details } : details;
  const form = new FormData();
  form.append("photo", file);
  form.append("title", title);
  form.append("description", description);
  form.append("comment", description); // Backward compatibility with older deployed APIs.

  let response: Response;
  try {
    response = await fetch(`/api/jobs/${jobId}/photos`, { method: "POST", body: form });
  } catch {
    throw new Error("Network error while saving photo. Check your connection and try again.");
  }
  if (!response.ok) throw await responseError(response, "Could not save photo");

  try {
    const data = await response.json();
    if (!data.photo) throw new Error("missing photo");
    return data.photo;
  } catch {
    throw new Error("The server returned an invalid photo response. Please try again.");
  }
}

export async function updateJobPhoto(jobId: number, photoId: string, details: Required<JobPhotoDetails>): Promise<JobPhoto> {
  let response: Response;
  try {
    response = await fetch(`/api/jobs/${jobId}/photos/${photoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(details),
    });
  } catch {
    throw new Error("Network error while updating photo details. Please try again.");
  }
  if (!response.ok) throw await responseError(response, "Could not update photo details");
  const data = await response.json();
  return data.photo;
}

export async function deleteJobPhoto(jobId: number, photoId: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/jobs/${jobId}/photos/${photoId}`, { method: "DELETE" });
  } catch {
    throw new Error("Network error while deleting photo. Please try again.");
  }
  if (!response.ok) throw await responseError(response, "Could not delete photo");
}
