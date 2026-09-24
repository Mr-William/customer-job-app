"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";

interface ImportCustomersModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedRow {
  name: string;
  phone: string;
  email: string;
  jobAddress: string;
  _raw: Record<string, string>;
  rowNumber: number; // Excel row number (i+2)
}

interface ExistingCustomer {
  id: number;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  jobAddress: string;
  displayName: string;
}

interface ConflictRow {
  imported: ParsedRow;
  existing: ExistingCustomer;
  differences: { field: "phone" | "email" | "jobAddress" | "name"; label: string; existingValue: string; importedValue: string }[];
}

interface Analysis {
  newRows: ParsedRow[];
  identicalRows: { imported: ParsedRow; existing: ExistingCustomer }[];
  conflictingRows: ConflictRow[];
  invalidRows: ParsedRow[];
  totalRows: number;
}

interface ImportResult {
  inserted: number;
  updated?: number;
  skipped: { row: number; reason: string }[];
  duplicates: { row: number; reason: string }[];
  identical?: number;
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
  const street = extractField(row, "street address", "streetaddress", "street", "address1", "address");
  const city = extractField(row, "city");
  const state = extractField(row, "state", "province");
  const zip = extractField(row, "zip", "zipcode", "zip code", "postal code", "postalcode", "postal");
  const country = extractField(row, "country");
  const cityStateZip = [city, state ? `${state}${zip ? " " + zip : ""}` : zip].filter(Boolean).join(", ");
  const parts = [street, cityStateZip, country].filter(Boolean);
  return parts.join(", ");
}
function parseName(row: Record<string, string>): string {
  return extractField(row, "name", "customername", "customer_name", "customer", "company", "business", "Name", "Customer", "Company");
}
function getDisplayName(c: { name?: string | null; firstName?: string | null; lastName?: string | null }): string {
  if (c.name) return c.name;
  const parts = [c.firstName, c.lastName].filter(Boolean);
  return parts.join(" ") || "Unnamed";
}

// Normalization for comparison (must match backend)
function normalizeName(str: string): string {
  return (str || "").toLowerCase().replace(/\s+/g, " ").trim();
}
function normalizePhone(str: string): string {
  return (str || "").replace(/\D/g, "");
}
function normalizeEmail(str: string): string {
  return (str || "").toLowerCase().trim();
}
function normalizeAddress(str: string): string {
  return (str || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function analyzeRows(parsed: ParsedRow[], existingCustomers: ExistingCustomer[]): Analysis {
  const existingByName = new Map<string, ExistingCustomer>();
  for (const ec of existingCustomers) {
    const key = normalizeName(ec.displayName);
    if (!key) continue;
    if (!existingByName.has(key)) existingByName.set(key, ec);
  }

  const newRows: ParsedRow[] = [];
  const identicalRows: { imported: ParsedRow; existing: ExistingCustomer }[] = [];
  const conflictingRows: ConflictRow[] = [];
  const invalidRows: ParsedRow[] = [];
  const seenInFile = new Set<string>();

  for (const row of parsed) {
    if (!row.name) {
      invalidRows.push(row);
      continue;
    }
    const norm = normalizeName(row.name);
    if (seenInFile.has(norm)) {
      // Duplicate name within the file itself — hide it as identical to avoid double-insert.
      // The first occurrence wins; second is treated as duplicate and will be skipped.
      const first = [...newRows, ...conflictingRows.map(c => c.imported), ...identicalRows.map(i => i.imported)].find(r => normalizeName(r.name) === norm);
      identicalRows.push({
        imported: row,
        existing: {
          id: -1,
          name: first?.name || row.name,
          firstName: null,
          lastName: null,
          phone: first?.phone || null,
          email: first?.email || null,
          jobAddress: first?.jobAddress || "",
          displayName: first?.name || row.name,
        },
      });
      continue;
    }
    seenInFile.add(norm);

    const existing = existingByName.get(norm);
    if (!existing) {
      newRows.push(row);
    } else {
      const phoneSame = normalizePhone(existing.phone || "") === normalizePhone(row.phone || "");
      const emailSame = normalizeEmail(existing.email || "") === normalizeEmail(row.email || "");
      const addrSame = normalizeAddress(existing.jobAddress || "") === normalizeAddress(row.jobAddress || "");
      const nameSame = normalizeName(existing.displayName) === normalizeName(row.name);

      if (phoneSame && emailSame && addrSame && nameSame) {
        identicalRows.push({ imported: row, existing });
      } else {
        const diffs: ConflictRow["differences"] = [];
        if (!phoneSame) diffs.push({ field: "phone", label: "Phone", existingValue: existing.phone || "", importedValue: row.phone || "" });
        if (!emailSame) diffs.push({ field: "email", label: "Email", existingValue: existing.email || "", importedValue: row.email || "" });
        if (!addrSame) diffs.push({ field: "jobAddress", label: "Address", existingValue: existing.jobAddress || "", importedValue: row.jobAddress || "" });
        // Name casing difference is not considered a conflict if normalized same, but show if different raw?
        // We only show other fields, but if name casing differs, it's still identical in logic, so not a diff.
        conflictingRows.push({ imported: row, existing, differences: diffs });
      }
    }
  }

  return { newRows, identicalRows, conflictingRows, invalidRows, totalRows: parsed.length };
}

export default function ImportCustomersModal({ onClose, onSuccess }: ImportCustomersModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [loading, setLoading] = useState(false);
  const [fetchingExisting, setFetchingExisting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const [existingCustomers, setExistingCustomers] = useState<ExistingCustomer[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [decisions, setDecisions] = useState<Record<string, "merge" | "overwrite" | "skip">>({}); // key = rowNumber

  const fetchExisting = useCallback(async () => {
    setFetchingExisting(true);
    try {
      const res = await fetch("/api/customers?compact=1");
      const data = await res.json();
      const list = (data.customers || []).map((c: any) => ({
        ...c,
        displayName: getDisplayName(c),
      }));
      setExistingCustomers(list);
      return list as ExistingCustomer[];
    } catch {
      setError("Failed to load existing customers for comparison.");
      return [] as ExistingCustomer[];
    } finally {
      setFetchingExisting(false);
    }
  }, []);

  useEffect(() => {
    // Preload existing for faster preview
    fetchExisting();
  }, [fetchExisting]);

  const processFile = useCallback(async (file: File) => {
    setError("");
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext || "")) {
      setError("Please upload a .xlsx, .xls, or .csv file.");
      return;
    }
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (e) => {
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

        const parsedRows: ParsedRow[] = json.map((row, idx) => ({
          name: parseName(row),
          phone: extractField(row, "phone", "phonenumber", "phone_number", "mobile", "cell", "telephone", "Phone", "Phone Number"),
          email: extractField(row, "email", "emailaddress", "email_address", "Email", "Email Address"),
          jobAddress: buildAddressPreview(row) || extractField(row, "job address", "jobaddress", "job_address", "address", "location", "job site", "jobsite"),
          _raw: row,
          rowNumber: idx + 2,
        }));

        setRawRows(json);
        setHeaders(Object.keys(json[0]));
        setParsed(parsedRows);

        // Ensure existing loaded
        let existing = existingCustomers;
        if (existing.length === 0) {
          existing = await fetchExisting();
        }

        const analysisResult = analyzeRows(parsedRows, existing);
        setAnalysis(analysisResult);

        // Default decisions: merge for all conflicts
        const defaultDecisions: Record<string, "merge" | "overwrite" | "skip"> = {};
        analysisResult.conflictingRows.forEach((c) => {
          defaultDecisions[c.imported.rowNumber] = "merge";
        });
        setDecisions(defaultDecisions);

        setStep("preview");
      } catch (err) {
        console.error(err);
        setError("Failed to parse the file. Please check the format and try again.");
      }
    };
    reader.readAsBinaryString(file);
  }, [existingCustomers, fetchExisting]);

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
    if (!analysis) return;
    setLoading(true);
    setError("");
    try {
      const inserts = analysis.newRows.map((r) => ({
        name: r.name,
        phone: r.phone,
        email: r.email,
        jobAddress: r.jobAddress,
      }));

      const updates = analysis.conflictingRows
        .filter((c) => decisions[c.imported.rowNumber] !== "skip" && c.existing.id !== -1)
        .map((c) => ({
          id: c.existing.id,
          name: c.imported.name,
          phone: c.imported.phone,
          email: c.imported.email,
          jobAddress: c.imported.jobAddress,
          mode: decisions[c.imported.rowNumber] || "merge",
        }));

      const res = await fetch("/api/customers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inserts, updates }),
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
    setParsed([]);
    setRawRows([]);
    setHeaders([]);
    setResult(null);
    setError("");
    setAnalysis(null);
    setDecisions({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const newCount = analysis?.newRows.length || 0;
  const conflictCount = analysis?.conflictingRows.length || 0;
  const identicalCount = analysis?.identicalRows.length || 0;
  const invalidCount = analysis?.invalidRows.length || 0;
  const activeUpdates = analysis?.conflictingRows.filter((c) => decisions[c.imported.rowNumber] !== "skip" && c.existing.id !== -1).length || 0;
  const totalToImport = newCount + activeUpdates;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content slide-in" style={{ maxWidth: "900px", maxHeight: "90vh", overflowY: "auto" }}>
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold" style={{ color: "var(--accent-orange)" }}>
              📂 Import Customers
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Compare by customer name. Only new and changed customers are shown.
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "22px", cursor: "pointer", lineHeight: 1, padding: "4px" }}>×</button>
        </div>

        {error && <div className="alert-error mb-4">{error}</div>}

        {/* Upload */}
        {step === "upload" && (
          <div className="fade-in">
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
              <p className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Drag & drop your spreadsheet here</p>
              <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>or click to browse</p>
              <span className="text-xs px-3 py-1 rounded-full" style={{ background: "rgba(249,115,22,0.1)", color: "var(--accent-orange)", border: "1px solid rgba(249,115,22,0.3)" }}>.xlsx · .xls · .csv</span>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} style={{ display: "none" }} />
            </div>

            <div className="mt-5 rounded-lg p-4" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-color)" }}>
              <p className="text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>📋 Expected Column Names</p>
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
                    <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{col.field}</span><br />
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>{col.examples}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
                Matching is done by <strong>Name only</strong> (case-insensitive). If a name already exists, we compare phone, email and address. Identical matches are hidden automatically. For name matches with different data you can choose <strong>Merge</strong> (keep existing where import is empty) or <strong>Overwrite</strong> (replace with imported data).
              </p>
            </div>
          </div>
        )}

        {/* Preview — New Logic */}
        {step === "preview" && analysis && (
          <div className="fade-in">
            <div className="flex items-center gap-3 p-3 rounded-lg mb-5" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-color)" }}>
              <span className="text-2xl">📄</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{fileName}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>{parsed.length} rows detected · {headers.length} columns {fetchingExisting ? "· loading existing..." : `· ${existingCustomers.length} existing customers`}</div>
              </div>
              <button onClick={reset} className="dr-btn-secondary" style={{ padding: "6px 12px", fontSize: "12px" }}>Change File</button>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-5 gap-2 mb-5">
              <div className="text-center p-3 rounded-lg" style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)" }}>
                <div className="text-xl font-bold" style={{ color: "var(--accent-orange)" }}>{analysis.totalRows}</div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Total</div>
              </div>
              <div className="text-center p-3 rounded-lg" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <div className="text-xl font-bold" style={{ color: "var(--success)" }}>{newCount}</div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>New</div>
              </div>
              <div className="text-center p-3 rounded-lg" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
                <div className="text-xl font-bold" style={{ color: "var(--warning)" }}>{conflictCount}</div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Name Match · Diff Data</div>
              </div>
              <div className="text-center p-3 rounded-lg" style={{ background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.2)" }}>
                <div className="text-xl font-bold" style={{ color: "var(--text-secondary)" }}>{identicalCount}</div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Identical (hidden)</div>
              </div>
              <div className="text-center p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <div className="text-xl font-bold" style={{ color: "var(--danger)" }}>{invalidCount}</div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Invalid</div>
              </div>
            </div>

            {identicalCount > 0 && (
              <div className="mb-4 p-3 rounded-lg text-xs" style={{ background: "rgba(100,116,139,0.06)", border: "1px solid var(--border-color)", color: "var(--text-muted)" }}>
                ℹ️ {identicalCount} customer{identicalCount !== 1 ? "s" : ""} already exist with exactly the same name, phone, email and address — they are hidden from the lists below and will not be imported.
              </div>
            )}

            {newCount === 0 && conflictCount === 0 && (
              <div className="alert-error mb-4">
                {identicalCount > 0 ? `All ${identicalCount} rows already exist with identical data. Nothing to import.` : "No new customers found and no existing customers with different data. Check your file."}
              </div>
            )}

            {/* New Customers */}
            {newCount > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: "var(--success)" }}>
                  <span>✨ New Customers</span>
                  <span className="text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.15)", color: "var(--success)" }}>{newCount} will be added</span>
                </h3>
                <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(34,197,94,0.3)", maxHeight: "220px", overflowY: "auto" }}>
                  <table className="dr-table" style={{ fontSize: "12px" }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                      <tr><th>#</th><th>Name</th><th>Phone</th><th>Email</th><th>Address</th></tr>
                    </thead>
                    <tbody>
                      {analysis.newRows.map((r) => (
                        <tr key={r.rowNumber}>
                          <td style={{ color: "var(--text-muted)" }}>{r.rowNumber}</td>
                          <td style={{ fontWeight: 600 }}>{r.name}</td>
                          <td>{r.phone || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                          <td style={{ color: "var(--text-muted)" }}>{r.email || "—"}</td>
                          <td><span style={{ maxWidth: "180px", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.jobAddress || "—"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Conflicting / Name matches with different data */}
            {conflictCount > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--warning)" }}>
                    <span>⚠️ Existing Customers — Different Data</span>
                    <span className="text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.15)", color: "var(--warning)" }}>{conflictCount} name match{conflictCount !== 1 ? "es" : ""}</span>
                  </h3>
                  <div className="flex gap-2">
                    <button onClick={() => { const nd: any = {}; analysis.conflictingRows.forEach(c => nd[c.imported.rowNumber] = "merge"); setDecisions(nd); }} className="dr-btn-secondary" style={{ padding: "4px 8px", fontSize: "11px" }}>All Merge</button>
                    <button onClick={() => { const nd: any = {}; analysis.conflictingRows.forEach(c => nd[c.imported.rowNumber] = "overwrite"); setDecisions(nd); }} className="dr-btn-secondary" style={{ padding: "4px 8px", fontSize: "11px" }}>All Overwrite</button>
                    <button onClick={() => { const nd: any = {}; analysis.conflictingRows.forEach(c => nd[c.imported.rowNumber] = "skip"); setDecisions(nd); }} className="dr-btn-secondary" style={{ padding: "4px 8px", fontSize: "11px" }}>All Skip</button>
                  </div>
                </div>

                <div className="space-y-3" style={{ maxHeight: "380px", overflowY: "auto", paddingRight: "4px" }}>
                  {analysis.conflictingRows.map((c) => (
                    <div key={c.imported.rowNumber} className="rounded-lg p-3" style={{ background: "var(--bg-tertiary)", border: "1px solid rgba(245,158,11,0.25)" }}>
                      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                        <div>
                          <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{c.imported.name} <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>· row {c.imported.rowNumber} {c.existing.id === -1 ? "(duplicate in file)" : `· existing #${c.existing.id}`}</span></div>
                          <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                            Differences: {c.differences.map(d => d.label).join(", ") || "name casing only"}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {(["merge", "overwrite", "skip"] as const).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => setDecisions((prev) => ({ ...prev, [c.imported.rowNumber]: mode }))}
                              className={decisions[c.imported.rowNumber] === mode ? "dr-btn-primary" : "dr-btn-secondary"}
                              style={{
                                padding: "4px 10px",
                                fontSize: "11px",
                                background: decisions[c.imported.rowNumber] === mode ? (mode === "skip" ? "var(--text-muted)" : mode === "overwrite" ? "var(--accent-orange)" : "var(--success)") : undefined,
                                color: decisions[c.imported.rowNumber] === mode ? "white" : undefined,
                                borderColor: decisions[c.imported.rowNumber] === mode ? "transparent" : undefined,
                              }}
                              title={mode === "merge" ? "Keep existing data where import is empty, otherwise use imported" : mode === "overwrite" ? "Replace existing with imported data (empty clears)" : "Do not import this row"}
                            >
                              {mode === "merge" ? "🔀 Merge" : mode === "overwrite" ? "📝 Overwrite" : "⏭️ Skip"}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-[11px]">
                        <div className="rounded p-2" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)" }}>
                          <div className="font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>Existing</div>
                          <div><span style={{ color: "var(--text-muted)" }}>Phone:</span> {c.existing.phone || "—"}</div>
                          <div><span style={{ color: "var(--text-muted)" }}>Email:</span> {c.existing.email || "—"}</div>
                          <div><span style={{ color: "var(--text-muted)" }}>Address:</span> {c.existing.jobAddress || "—"}</div>
                        </div>
                        <div className="rounded p-2" style={{ background: "rgba(249,115,22,0.04)", border: "1px solid rgba(249,115,22,0.2)" }}>
                          <div className="font-semibold mb-1" style={{ color: "var(--accent-orange)" }}>Imported</div>
                          <div style={{ background: c.differences.some(d => d.field === "phone") ? "rgba(245,158,11,0.15)" : undefined, borderRadius: "3px", padding: "1px 3px" }}><span style={{ color: "var(--text-muted)" }}>Phone:</span> {c.imported.phone || "—"}</div>
                          <div style={{ background: c.differences.some(d => d.field === "email") ? "rgba(245,158,11,0.15)" : undefined, borderRadius: "3px", padding: "1px 3px" }}><span style={{ color: "var(--text-muted)" }}>Email:</span> {c.imported.email || "—"}</div>
                          <div style={{ background: c.differences.some(d => d.field === "jobAddress") ? "rgba(245,158,11,0.15)" : undefined, borderRadius: "3px", padding: "1px 3px" }}><span style={{ color: "var(--text-muted)" }}>Address:</span> {c.imported.jobAddress || "—"}</div>
                        </div>
                      </div>

                      <div className="mt-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {decisions[c.imported.rowNumber] === "merge" && "Merge: keeps existing values when imported field is empty."}
                        {decisions[c.imported.rowNumber] === "overwrite" && "Overwrite: replaces existing with imported values — empty imported fields will clear existing data."}
                        {decisions[c.imported.rowNumber] === "skip" && "Skip: this row will not be imported."}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {invalidCount > 0 && (
              <div className="mb-5 rounded-lg p-3" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <p className="text-xs font-semibold mb-2" style={{ color: "var(--danger)" }}>✗ Invalid rows (missing Name) — will be skipped:</p>
                <div style={{ maxHeight: "100px", overflowY: "auto" }}>
                  {analysis.invalidRows.map((r) => (
                    <p key={r.rowNumber} className="text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>Row {r.rowNumber}: no Name found</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={reset} className="dr-btn-secondary flex-1" style={{ justifyContent: "center" }}>← Back</button>
              <button
                onClick={handleImport}
                className="dr-btn-primary flex-1"
                disabled={loading || totalToImport === 0}
                style={{ justifyContent: "center" }}
              >
                {loading ? "Importing..." : totalToImport > 0 ? `Import ${totalToImport} — ${newCount} new + ${activeUpdates} update${activeUpdates !== 1 ? "s" : ""}` : "Nothing to Import"}
              </button>
            </div>
          </div>
        )}

        {/* Result */}
        {step === "result" && result && (
          <div className="fade-in text-center py-4">
            <div className="text-5xl mb-4">{(result.inserted > 0 || (result.updated || 0) > 0) ? "✅" : "⚠️"}</div>
            <h3 className="text-2xl font-bold mb-2" style={{ color: (result.inserted > 0 || (result.updated || 0) > 0) ? "var(--success)" : "var(--warning)" }}>Import Complete</h3>
            <div className="grid grid-cols-5 gap-2 my-6">
              <div className="p-3 rounded-lg" style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)" }}>
                <div className="text-xl font-bold" style={{ color: "var(--accent-orange)" }}>{result.total}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Total</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <div className="text-xl font-bold" style={{ color: "var(--success)" }}>{result.inserted}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>New</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}>
                <div className="text-xl font-bold" style={{ color: "#3b82f6" }}>{result.updated ?? 0}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Updated</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <div className="text-xl font-bold" style={{ color: "var(--warning)" }}>{result.duplicates?.length ?? 0}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Duplicates</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <div className="text-xl font-bold" style={{ color: "var(--danger)" }}>{result.skipped.length}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Skipped</div>
              </div>
            </div>

            {(result.identical ?? 0) > 0 && (
              <div className="text-left rounded-lg p-3 mb-4" style={{ background: "rgba(100,116,139,0.05)", border: "1px solid rgba(100,116,139,0.2)", maxHeight: "120px", overflowY: "auto" }}>
                <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>ℹ️ Identical hidden: {result.identical}</p>
              </div>
            )}

            {(result.duplicates?.length ?? 0) > 0 && (
              <div className="text-left rounded-lg p-3 mb-4" style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.25)", maxHeight: "140px", overflowY: "auto" }}>
                <p className="text-sm font-semibold mb-2" style={{ color: "var(--warning)" }}>⚠ Duplicates:</p>
                {result.duplicates.map((d, i) => (
                  <p key={i} className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Row {d.row}: {d.reason}</p>
                ))}
              </div>
            )}

            {result.skipped.length > 0 && (
              <div className="text-left rounded-lg p-3 mb-4" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", maxHeight: "140px", overflowY: "auto" }}>
                <p className="text-sm font-semibold mb-2" style={{ color: "var(--danger)" }}>✗ Skipped:</p>
                {result.skipped.map((s, i) => (
                  <p key={i} className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Row {s.row}: {s.reason}</p>
                ))}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button onClick={reset} className="dr-btn-secondary">Import Another File</button>
              <button onClick={onClose} className="dr-btn-primary">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
