"use client";

interface JobPhotoButtonsProps {
  photoCount: number;
  onAdd: () => void;
  onView: () => void;
}

function CameraIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
      <path d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  );
}

export default function JobPhotoButtons({ photoCount, onAdd, onView }: JobPhotoButtonsProps) {
  return (
    <section className="job-photos-section" aria-label="Job photos">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          Job Photos
        </h3>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {photoCount === 0 ? "None saved yet" : `${photoCount} saved`}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="dr-btn-photo dr-btn-photo--add" onClick={onAdd}>
          <CameraIcon />
          Add Photo
        </button>
        <button type="button" className="dr-btn-photo dr-btn-photo--view" onClick={onView}>
          <GalleryIcon />
          View Photos
          <span className="dr-btn-photo__count" aria-label={`${photoCount} photos`}>
            {photoCount}
          </span>
        </button>
      </div>
    </section>
  );
}
