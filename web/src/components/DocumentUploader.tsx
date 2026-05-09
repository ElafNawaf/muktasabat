"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { EntityDocument } from "@/lib/types";

/**
 * Inline document/attachment uploader used inside Building / Contract forms.
 *
 * - Supports `kind="buildings"` + `relation="documents"` and
 *   `kind="contracts"` + `relation="attachments"` (uploads proxy decides).
 * - Drag-drop or click; multiple files; 16 MB cap; pdf/doc(x)/xls(x)/txt/csv
 *   plus jpeg/png/webp for scanned documents.
 * - Refreshes the route after each successful upload/delete so the parent
 *   form sees the new list (no client-side cache mutation).
 *
 * Renders nothing useful when `entityId` is null — the upload endpoints need
 * the parent record to exist first, so the form shows a hint to "save and
 * reopen" until then.
 */

const ACCEPT =
  "application/pdf," +
  "application/msword," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.ms-excel," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "text/plain,text/csv," +
  "image/jpeg,image/jpg,image/png,image/webp";
const MAX_BYTES = 16 * 1024 * 1024;

const FILE_ICON: Record<string, string> = {
  "application/pdf": "picture_as_pdf",
  "application/msword": "description",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "description",
  "application/vnd.ms-excel": "table_chart",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "table_chart",
  "text/plain": "notes",
  "text/csv": "table_chart",
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/png": "image",
  "image/webp": "image",
};

export function DocumentUploader({
  kind,
  relation,
  entityId,
  documents,
}: {
  kind: "buildings" | "contracts";
  relation: "documents" | "attachments";
  entityId: number | null;
  documents: EntityDocument[];
}) {
  const t = useTranslations("documents");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (entityId == null) {
    return (
      <div
        className="text-sec"
        style={{ fontSize: 12.5, padding: 12, textAlign: "center" }}
      >
        {t("saveFirst")}
      </div>
    );
  }

  const upload = async (file: File) => {
    if (!ACCEPT.split(",").includes(file.type)) {
      setError(t("badType"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t("tooLarge"));
      return;
    }
    setError(null);
    setBusy("upload");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/uploads/${kind}/${entityId}/${relation}`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
        };
        if (res.status === 503) {
          setError(t("notConfigured"));
        } else {
          setError(data.error || data.detail || t("uploadFailed"));
        }
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (doc: EntityDocument) => {
    setError(null);
    setBusy(`del-${doc.id}`);
    try {
      const res = await fetch(
        `/api/uploads/${kind}/${entityId}/${relation}?id=${doc.id}`,
        { method: "DELETE" },
      );
      if (!res.ok && res.status !== 204) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || t("deleteFailed"));
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const onFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((f) => void upload(f));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {error && (
        <div className="badge badge-danger" style={{ padding: "8px 12px", fontSize: 12 }}>
          {error}
        </div>
      )}

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFiles(e.dataTransfer.files);
        }}
        style={{
          border: "1.5px dashed var(--color-border)",
          borderRadius: 10,
          padding: 18,
          textAlign: "center",
          cursor: "pointer",
          background: "var(--color-bg-deep)",
          color: "var(--color-text-secondary)",
        }}
      >
        <span className="ms" style={{ fontSize: 26 }}>
          {busy === "upload" ? "progress_activity" : "upload_file"}
        </span>
        <div style={{ fontSize: 12.5, marginTop: 4 }}>
          {busy === "upload" ? t("uploading") : t("dropOrClick")}
        </div>
        <div style={{ fontSize: 11, marginTop: 2, opacity: 0.8 }}>{t("typesHint")}</div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          style={{ display: "none" }}
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      {documents.length === 0 ? (
        <div className="text-sec" style={{ fontSize: 12, textAlign: "center", padding: 8 }}>
          {t("noDocuments")}
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {documents.map((doc) => (
            <li
              key={doc.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                background: "var(--color-bg)",
              }}
            >
              <span className="ms ms-sm" style={{ color: "var(--color-primary)" }}>
                {FILE_ICON[doc.file_type ?? ""] ?? "insert_drive_file"}
              </span>
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 12.5,
                  textDecoration: "none",
                  color: "inherit",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={doc.filename}
              >
                {doc.filename}
              </a>
              <button
                type="button"
                className="icon-btn"
                onClick={() => remove(doc)}
                disabled={busy === `del-${doc.id}`}
                title={tCommon("delete")}
              >
                <span className="ms ms-sm">
                  {busy === `del-${doc.id}` ? "progress_activity" : "delete"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
