"use client";
import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

interface ImportCustomersModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedRow {
  firstName: string; // kept for compat but unused in import
  lastName: string;
  phone: string;
  email: string;
  jobAddress: string;
  _raw: Record<string, string>;
}

interface ImportResult {
  inserted: number;
  skipped: { row: number; reason: string }[];
  duplicates: { row: number; reason: string }[];
  total: number;
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/\s+/g, "");
}

function extractField(row: Record<string, string>, ...keys: string[]): string {
  const norm: Record<string, string> = {};
  for (const k of Object.keys(row)) norm[normalizeKey(k)] = (row[k] || "").toString().trim();
  for (const key of keys) {
    if (norm[normalizeKey(key)]) return norm[normalizeKey(key)];
  }
  return "";
}

function buildAddressPreview(row: Record<string, string>): string {
  const street  = extractField(row, "street address", "streetaddress", "street", "address1", "address");
  const city    = extractField(row, "city");
  const state   = extractField(row, "state", "province");
  const zip     = extractField(row, "zip", "zipcode", "zip code", "postal code", "postalcode", "postal");
  const country = extractField(row, "country");

  const cityStateZip = [city, state ? `${state}${zip ? " " + zip : ""}` : zip].filter(Boolean).join(", ");
  const parts = [street, cityStateZip, country].filter(Boolean);
  return parts.join(", ");
}

function parseRows(data: Record<string, string>[]): ParsedRow[] {
  return data.map((row) => ({
    firstName: "",
    lastName: "",
    phone: extractField(row, "phone", "phonenumber", "phone_number", "mobile", "cell", "telephone", "Phone", "Phone Number"),
    email: extractField(row, "email", "emailaddress", "email_address", "Email", "Email Address"),
    jobAddress: buildAddressPreview(row),
    _raw: row,
  }));
}

function parseName(row: Record<string, string>): string {
  return extractField(row, "name", "customername", "customer_name", "customer", "company", "business", "Name", "Customer", "Company");
}

export default function ImportCustomersModal({ onClose, onSuccess }: ImportCustomersModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const processFile = useCallback((file: File) => {
    setError("");
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext || "")) {
      setError("Please upload a .xlsx, .xls, or .csv file.");
      return;
    }
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
          defval: "",
          raw: false,
        });

        if (json.length === 0) {
          setError("The spreadsheet appears to be empty.");
          return;
        }

        setRawRows(json);
        setHeaders(Object.keys(json[0]));
        setPreview(parseRows(json));
        setStep("preview");
      } catch {
        setError("Failed to parse the file. Please check the format and try again.");
      }
    };
    reader.readAsBinaryString(file);
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  async function handleImport() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/customers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rawRows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import failed.");
      } else {
        setResult(data);
        setStep("result");
        onSuccess();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("upload");
    setFileName("");
    setPreview([]);
    setRawRows([]);
    setHeaders([]);
    setResult(null);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Only Name is required — phone and address are optional.
  const validRows = preview.filter((r) => parseName(r._raw));
  const invalidRows = preview.filter((r) => !parseName(r._raw));

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal-content slide-in"
        style={{ maxWidth: "760px" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold" style={{ color: "var(--accent-orange)" }}>
              📂 Import Customers
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Upload a spreadsheet (.xlsx, .xls, or .csv) to bulk-import customers.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: "var(--text-muted)",
              fontSize: "22px", cursor: "pointer", lineHeight: 1, padding: "4px",
            }}
          >
            ×
          </button>
        </div>

        {error && <div className="alert-error mb-4">{error}</div>}

        {/* ── Step 1: Upload ── */}
        {step === "upload" && (
          <div className="fade-in">
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? "var(--accent-orange)" : "var(--border-color)"}`,
                borderRadius: "10px",
                padding: "48px 24px",
                textAlign: "center",
                cursor: "pointer",
                background: dragging ? "rgba(249,115,22,0.05)" : "var(--bg-primary)",
                transition: "all 0.2s",
              }}
            >
              <div className="text-5xl mb-4">📊</div>
              <p className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                Drag & drop your spreadsheet here
              </p>
              <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
                or click to browse
              </p>
              <span
                className="text-xs px-3 py-1 rounded-full"
                style={{
                  background: "rgba(249,115,22,0.1)",
                  color: "var(--accent-orange)",
                  border: "1px solid rgba(249,115,22,0.3)",
                }}
              >
                .xlsx · .xls · .csv
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
            </div>

            {/* Column guide */}
            <div
              className="mt-5 rounded-lg p-4"
              style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-color)" }}
            >
              <p className="text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
                📋 Expected Column Names
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { field: "Name *", examples: "Name, Customer, Company, Business" },
                  { field: "Phone", examples: "Phone, Phone Number, Mobile, Cell (optional)" },
                  { field: "Street Address", examples: "Street Address, Street, Address (optional)" },
                  { field: "City", examples: "City (optional)" },
                  { field: "State", examples: "State, Province (optional)" },
                  { field: "Zip", examples: "Zip, Zip Code, Postal Code (optional)" },
                  { field: "Country", examples: "Country (optional)" },
                  { field: "Email", examples: "Email, Email Address (optional)" },
                ].map((col) => (
                  <div key={col.field}>
                    <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                      {col.field}
                    </span>
                    <br />
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {col.examples}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
                Only <strong>Name</strong> is required — rows missing a phone number or address will still be imported, and you can fill those in later. Street Address, City, State, and Zip are combined automatically into the Job Address field. Name can be a person&apos;s full name or a business name.
              </p>
            </div>
          </div>
        )}

        {/* ── Step 2: Preview ── */}
        {step === "preview" && (
          <div className="fade-in">
            {/* File info */}
            <div
              className="flex items-center gap-3 p-3 rounded-lg mb-5"
              style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-color)" }}
            >
              <span className="text-2xl">📄</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                  {fileName}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {preview.length} rows detected · {headers.length} columns
                </div>
              </div>
              <button onClick={reset} className="dr-btn-secondary" style={{ padding: "6px 12px", fontSize: "12px" }}>
                Change File
              </button>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="text-center p-3 rounded-lg" style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)" }}>
                <div className="text-2xl font-bold" style={{ color: "var(--accent-orange)" }}>{preview.length}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Total Rows</div>
              </div>
              <div className="text-center p-3 rounded-lg" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <div className="text-2xl font-bold" style={{ color: "var(--success)" }}>{validRows.length}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Ready to Import</div>
              </div>
              <div className="text-center p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <div className="text-2xl font-bold" style={{ color: "var(--danger)" }}>{invalidRows.length}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Will Be Skipped</div>
              </div>
            </div>

            {/* Preview table */}
            <div
              className="rounded-lg overflow-hidden mb-5"
              style={{ border: "1px solid var(--border-color)", maxHeight: "280px", overflowY: "auto", overflowX: "auto" }}
            >
              <table className="dr-table" style={{ fontSize: "12px", minWidth: "600px" }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ width: "32px" }}>#</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Address</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => {
                    const nameVal = parseName(row._raw);
                    const isValid = !!nameVal;
                    return (
                      <tr key={i}>
                        <td style={{ color: "var(--text-muted)" }}>{i + 2}</td>
                        <td>
                          {nameVal
                            ? nameVal
                            : <span style={{ color: "var(--danger)" }}>—</span>}
                        </td>
                        <td>
                          {row.phone
                            ? row.phone
                            : <span style={{ color: "var(--text-muted)" }}>—</span>}
                        </td>
                        <td style={{ color: "var(--text-muted)" }}>{row.email || "—"}</td>
                        <td>
                          {row.jobAddress
                            ? <span style={{ maxWidth: "150px", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.jobAddress}</span>
                            : <span style={{ color: "var(--text-muted)" }}>—</span>}
                        </td>
                        <td>
                          {isValid
                            ? <span className="badge-success">✓ OK</span>
                            : <span className="badge-danger">⚠ Skip</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {validRows.length === 0 && (
              <div className="alert-error mb-4">
                No valid rows found — every row is missing a Name. Please check that your spreadsheet has a Name, Customer, Company, or Business column.
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={reset} className="dr-btn-secondary flex-1" style={{ justifyContent: "center" }}>
                ← Back
              </button>
              <button
                onClick={handleImport}
                className="dr-btn-primary flex-1"
                disabled={loading || validRows.length === 0}
                style={{ justifyContent: "center" }}
              >
                {loading ? "Importing..." : `Import ${validRows.length} Customer${validRows.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Result ── */}
        {step === "result" && result && (
          <div className="fade-in text-center py-4">
            <div className="text-5xl mb-4">
              {result.inserted > 0 ? "✅" : "⚠️"}
            </div>
            <h3
              className="text-2xl font-bold mb-2"
              style={{ color: result.inserted > 0 ? "var(--success)" : "var(--warning)" }}
            >
              Import Complete
            </h3>
            <div className="grid grid-cols-4 gap-3 my-6">
              <div className="p-3 rounded-lg" style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)" }}>
                <div className="text-2xl font-bold" style={{ color: "var(--accent-orange)" }}>{result.total}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Total Rows</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <div className="text-2xl font-bold" style={{ color: "var(--success)" }}>{result.inserted}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Imported</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <div className="text-2xl font-bold" style={{ color: "var(--warning)" }}>{result.duplicates?.length ?? 0}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Duplicates</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <div className="text-2xl font-bold" style={{ color: "var(--danger)" }}>{result.skipped.length}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Skipped</div>
              </div>
            </div>

            {(result.duplicates?.length ?? 0) > 0 && (
              <div
                className="text-left rounded-lg p-3 mb-4"
                style={{
                  background: "rgba(245,158,11,0.05)",
                  border: "1px solid rgba(245,158,11,0.25)",
                  maxHeight: "140px",
                  overflowY: "auto",
                }}
              >
                <p className="text-sm font-semibold mb-2" style={{ color: "var(--warning)" }}>
                  ⚠ Duplicates Skipped:
                </p>
                {result.duplicates.map((d, i) => (
                  <p key={i} className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                    Row {d.row}: {d.reason}
                  </p>
                ))}
              </div>
            )}

            {result.skipped.length > 0 && (
              <div
                className="text-left rounded-lg p-3 mb-4"
                style={{
                  background: "rgba(239,68,68,0.05)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  maxHeight: "140px",
                  overflowY: "auto",
                }}
              >
                <p className="text-sm font-semibold mb-2" style={{ color: "var(--danger)" }}>
                  ✗ Missing Data — Skipped:
                </p>
                {result.skipped.map((s, i) => (
                  <p key={i} className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                    Row {s.row}: {s.reason}
                  </p>
                ))}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button onClick={reset} className="dr-btn-secondary">
                Import Another File
              </button>
              <button onClick={onClose} className="dr-btn-primary">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
