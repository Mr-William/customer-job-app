export const MAX_JOB_PHOTO_BYTES = 15 * 1024 * 1024;

export interface JobPhoto {
  id: string;
  url: string;
  comment: string;
  createdAt: string;
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
  if (file.size > MAX_JOB_PHOTO_BYTES) {
    return "Photo is too large. Choose an image up to 15 MB.";
  }
  if (!jobPhotoExtension(file.type)) {
    return "Supported formats: JPEG, PNG, WebP, HEIC, and GIF.";
  }
  return null;
}

/** Upload a job photo and turn proxy/API failures into actionable UI errors. */
export async function uploadJobPhoto(jobId: number, file: File, comment: string): Promise<JobPhoto> {
  const validationError = jobPhotoValidationError(file);
  if (validationError) throw new Error(validationError);

  const form = new FormData();
  form.append("photo", file);
  form.append("comment", comment);

  let response: Response;
  try {
    response = await fetch(`/api/jobs/${jobId}/photos`, { method: "POST", body: form });
  } catch {
    throw new Error("Network error while saving photo. Check your connection and try again.");
  }

  let data: { photo?: JobPhoto; error?: string };
  try {
    data = await response.json();
  } catch {
    // Nginx's oversized-request and error pages are HTML, not JSON. Do not
    // misreport those server responses as a browser network failure.
    if (response.status === 413) {
      throw new Error("The upload was rejected as too large. Choose an image up to 15 MB, or ask the administrator to check the server's upload limit.");
    }
    throw new Error(`Could not save photo (server returned ${response.status}). Please try again.`);
  }

  if (!response.ok) throw new Error(data.error || "Could not save photo. Please try again.");
  if (!data.photo) throw new Error("The server returned an invalid photo response. Please try again.");
  return data.photo;
}
