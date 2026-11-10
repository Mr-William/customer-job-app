"use client";

import { useEffect, useRef, useState } from "react";
import ScheduledLine from "@/components/ScheduledLine";
import JobPhotoGallery from "@/components/JobPhotoGallery";
import { uploadJobPhoto, type JobPhoto } from "@/lib/jobPhotos";

type Job = {
  id: number;
  employeeName: string;
  totalHoursWorked: number;
  workCompleted: string;
  jobCompleted: boolean;
  jobPartiallyCompleted: boolean;
  additionalWorkRecommended: boolean;
  billSent: boolean;
  billPaid: boolean;
  additionalDetails: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  scheduledEndTime?: string | null;
};

export default function ViewJobModal({ job, customerName, onClose }: { job: Job; customerName: string; onClose: () => void }) {
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [gallery, setGallery] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [saving, setSaving] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  async function upload() {
    if (!file) return;
    setSaving(true);
    setUploadError("");
    try {
      const photo = await uploadJobPhoto(job.id, file, { title, description });
      setPhotos(current => [photo, ...current]);
      setFile(null);
      setTitle("");
      setDescription("");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not save photo. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    fetch(`/api/jobs/${job.id}/photos`)
      .then(response => response.ok ? response.json() : { photos: [] })
      .then(data => setPhotos(data.photos || []))
      .catch(() => {});
  }, [job.id]);

  const status = job.jobCompleted ? "Completed" : job.jobPartiallyCompleted ? "Partially completed" : job.additionalWorkRecommended ? "Additional work recommended" : "Pending";

  return (
    <div className="modal-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-content slide-in" style={{ maxWidth: 700 }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold" style={{ color: "var(--accent-orange)" }}>Job Details</h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>For: <span style={{ color: "var(--text-primary)" }}>{customerName}</span></p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: "none", border: 0, fontSize: 24, color: "var(--text-muted)", cursor: "pointer" }}>×</button>
        </div>

        <div className="space-y-4">
          <section><label className="dr-label">Employee</label><p>{job.employeeName}</p></section>
          <section><label className="dr-label">Work Completed</label><p style={{ whiteSpace: "pre-wrap" }}>{job.workCompleted || "—"}</p></section>
          <div className="grid grid-cols-2 gap-4">
            <section><label className="dr-label">Hours Worked</label><p>{job.totalHoursWorked}h</p></section>
            <section><label className="dr-label">Status</label><p>{status}</p></section>
          </div>
          <section><label className="dr-label">Billing</label><p>{job.billPaid ? "Paid" : job.billSent ? "Bill sent" : "—"}</p></section>
          <section><label className="dr-label">Schedule</label><ScheduledLine date={job.scheduledDate} start={job.scheduledTime} end={job.scheduledEndTime} /></section>
          <section><label className="dr-label">Additional Details</label><p style={{ whiteSpace: "pre-wrap" }}>{job.additionalDetails || "—"}</p></section>

          <div className="flex gap-3">
            <button type="button" className="dr-btn-secondary" onClick={() => setChooser(true)}>＋ Add Photo</button>
            <button type="button" className="dr-btn-secondary" onClick={() => setGallery(true)}>View Photos ({photos.length})</button>
            <input ref={picker} type="file" accept="image/*" hidden onChange={event => setFile(event.target.files?.[0] || null)} />
            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={event => setFile(event.target.files?.[0] || null)} />
          </div>

          {chooser && <div className="flex gap-2">
            <button type="button" className="dr-btn-secondary" onClick={() => { setChooser(false); camera.current?.click(); }}>Take a new photo</button>
            <button type="button" className="dr-btn-secondary" onClick={() => { setChooser(false); picker.current?.click(); }}>Choose from device</button>
            <button type="button" className="dr-btn-secondary" onClick={() => setChooser(false)}>Cancel</button>
          </div>}

          {file && <div>
            <p className="text-sm mb-2">Add {file.name}</p>
            <input className="dr-input mb-2" maxLength={120} placeholder="Optional title" value={title} onChange={event => setTitle(event.target.value)} />
            <textarea className="dr-input" rows={2} maxLength={500} placeholder="Optional description" value={description} onChange={event => setDescription(event.target.value)} />
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>Large photos are automatically resized and compressed before upload.</p>
            {uploadError && <p className="text-sm mt-2" style={{ color: "var(--danger, #ef4444)" }}>{uploadError}</p>}
            <div className="flex gap-2 mt-3">
              <button type="button" className="dr-btn-primary" disabled={saving} onClick={() => void upload()}>{saving ? "Optimising & saving…" : "Save Photo"}</button>
              <button type="button" className="dr-btn-secondary" onClick={() => setFile(null)}>Cancel</button>
            </div>
          </div>}

          {gallery && <JobPhotoGallery jobId={job.id} photos={photos} onPhotosChange={setPhotos} onClose={() => setGallery(false)} />}
        </div>
        <div className="flex justify-end mt-6"><button type="button" className="dr-btn-secondary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
