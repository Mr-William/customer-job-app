"use client";

import { useState } from "react";
import { deleteJobPhoto, updateJobPhoto, type JobPhoto } from "@/lib/jobPhotos";

interface JobPhotoGalleryProps {
  jobId: number;
  photos: JobPhoto[];
  onPhotosChange: (photos: JobPhoto[]) => void;
  onClose: () => void;
}

export default function JobPhotoGallery({ jobId, photos, onPhotosChange, onClose }: JobPhotoGalleryProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState("");
  const active = photos.find(photo => photo.id === activeId) || null;

  function openPhoto(photo: JobPhoto) {
    setActiveId(photo.id);
    setTitle(photo.title || "");
    setDescription(photo.description || photo.comment || "");
    setEditing(false);
    setError("");
  }

  function backToGrid() {
    setActiveId(null);
    setEditing(false);
    setError("");
  }

  async function saveDetails() {
    if (!active) return;
    setBusy("save");
    setError("");
    try {
      const updated = await updateJobPhoto(jobId, active.id, { title, description });
      onPhotosChange(photos.map(photo => photo.id === updated.id ? updated : photo));
      setTitle(updated.title);
      setDescription(updated.description);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update photo details.");
    } finally {
      setBusy(null);
    }
  }

  async function removePhoto() {
    if (!active || !window.confirm("Delete this photo permanently? This cannot be undone.")) return;
    setBusy("delete");
    setError("");
    try {
      await deleteJobPhoto(jobId, active.id);
      onPhotosChange(photos.filter(photo => photo.id !== active.id));
      backToGrid();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete photo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 120 }} onClick={event => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <div className="modal-content" style={{ maxWidth: 900, maxHeight: "90vh", overflowY: "auto" }}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Job Photos</h3>
          <button type="button" aria-label="Close photos" onClick={onClose} disabled={!!busy}
            style={{ background: "none", border: 0, fontSize: 28, color: "var(--text-muted)", cursor: "pointer" }}>×</button>
        </div>

        {active ? (
          <div>
            <button type="button" className="dr-btn-secondary mb-3" onClick={backToGrid} disabled={!!busy}>← All photos</button>
            <div style={{ textAlign: "center" }}>
              <img src={active.url} alt={active.title || active.description || "Job photo"}
                style={{ maxWidth: "100%", maxHeight: editing ? "42vh" : "55vh", objectFit: "contain" }} />
            </div>

            {editing ? (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="dr-label" htmlFor={`photo-title-${active.id}`}>Title</label>
                  <input id={`photo-title-${active.id}`} className="dr-input" maxLength={120} value={title}
                    placeholder="Optional title" onChange={event => setTitle(event.target.value)} disabled={!!busy} />
                </div>
                <div>
                  <label className="dr-label" htmlFor={`photo-description-${active.id}`}>Description</label>
                  <textarea id={`photo-description-${active.id}`} className="dr-input" rows={3} maxLength={500} value={description}
                    placeholder="Optional description" onChange={event => setDescription(event.target.value)} disabled={!!busy} />
                </div>
                <div className="flex gap-2">
                  <button type="button" className="dr-btn-primary" onClick={() => void saveDetails()} disabled={!!busy}>
                    {busy === "save" ? "Saving…" : "Save Details"}
                  </button>
                  <button type="button" className="dr-btn-secondary" onClick={() => {
                    setTitle(active.title || "");
                    setDescription(active.description || active.comment || "");
                    setEditing(false);
                    setError("");
                  }} disabled={!!busy}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                {active.title && <h4 className="text-lg font-semibold">{active.title}</h4>}
                {(active.description || active.comment) &&
                  <p className="mt-1" style={{ whiteSpace: "pre-wrap" }}>{active.description || active.comment}</p>}
                {!active.title && !(active.description || active.comment) &&
                  <p style={{ color: "var(--text-muted)" }}>No title or description.</p>}
                <div className="flex flex-wrap gap-2 mt-4">
                  <button type="button" className="dr-btn-secondary" onClick={() => setEditing(true)} disabled={!!busy}>Edit Details</button>
                  <button type="button" className="dr-btn-secondary" onClick={() => void removePhoto()} disabled={!!busy}
                    style={{ color: "var(--danger, #ef4444)" }}>{busy === "delete" ? "Deleting…" : "Delete Photo"}</button>
                </div>
              </div>
            )}
            {error && <p role="alert" className="text-sm mt-3" style={{ color: "var(--danger, #ef4444)" }}>{error}</p>}
          </div>
        ) : photos.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map(photo => (
              <button type="button" key={photo.id} onClick={() => openPhoto(photo)}
                style={{ padding: 0, border: "1px solid var(--border-color)", borderRadius: 8, overflow: "hidden", background: "transparent", cursor: "pointer", textAlign: "left" }}>
                <img src={photo.url} alt={photo.title || photo.description || "Job photo"}
                  style={{ width: "100%", height: 150, objectFit: "cover" }} />
                {(photo.title || photo.description || photo.comment) &&
                  <span className="block text-xs p-2">{photo.title || photo.description || photo.comment}</span>}
              </button>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--text-muted)" }}>No photos have been added to this job yet.</p>
        )}
      </div>
    </div>
  );
}
