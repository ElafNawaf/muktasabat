"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { EntityImage } from "@/lib/types";

import { Modal } from "./Modal";

type Kind = "buildings" | "units";

const ACCEPT = "image/jpeg,image/jpg,image/png,image/webp,image/gif";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export function ImageGalleryEditor({
  open,
  onClose,
  kind,
  entityId,
  title,
  images,
}: {
  open: boolean;
  onClose: () => void;
  kind: Kind;
  entityId: number;
  title: string;
  images: EntityImage[];
}) {
  const t = useTranslations("imageGallery");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const res = await fetch(`/api/uploads/${kind}/${entityId}`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
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

  const remove = async (image: EntityImage) => {
    setError(null);
    setBusy(`del-${image.id}`);
    try {
      const res = await fetch(
        `/api/uploads/${kind}/${entityId}?image_id=${image.id}`,
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
    <Modal open={open} onClose={onClose} title={title} subtitle={t("subtitle")} size="lg">
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
          borderRadius: 12,
          padding: 24,
          textAlign: "center",
          cursor: "pointer",
          background: "var(--color-bg-deep)",
          color: "var(--color-text-secondary)",
        }}
      >
        <span className="ms" style={{ fontSize: 32 }}>
          {busy === "upload" ? "progress_activity" : "cloud_upload"}
        </span>
        <div style={{ fontSize: 13, marginTop: 6 }}>
          {busy === "upload" ? t("uploading") : t("dropOrClick")}
        </div>
        <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>{t("typesHint")}</div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          style={{ display: "none" }}
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      {images.length === 0 ? (
        <div
          className="text-sec"
          style={{ fontSize: 12, textAlign: "center", padding: 16 }}
        >
          {t("noImages")}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 10,
          }}
        >
          {images.map((img) => (
            <div
              key={img.id}
              style={{
                position: "relative",
                aspectRatio: "1 / 1",
                borderRadius: 10,
                overflow: "hidden",
                border: "1px solid var(--color-border)",
                background: "var(--color-bg-deep)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.caption ?? ""}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => remove(img)}
                disabled={busy === `del-${img.id}`}
                title={tCommon("delete")}
                style={{
                  position: "absolute",
                  top: 6,
                  insetInlineEnd: 6,
                  background: "rgba(0,0,0,0.55)",
                  color: "#fff",
                  borderColor: "transparent",
                }}
              >
                <span className="ms ms-sm">
                  {busy === `del-${img.id}` ? "progress_activity" : "delete"}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
