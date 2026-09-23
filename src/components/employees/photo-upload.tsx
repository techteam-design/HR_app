"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/validations/employee";

// Admin-only photo upload. Only rendered when R2 storage is configured.
// 1) ask the server for a presigned upload URL, 2) upload straight to R2,
// 3) ask the server to verify and save it.
export function PhotoUpload({ employeeId, hasPhoto }: { employeeId: string; hasPhoto: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);

    if (!(file.type in PHOTO_TYPES)) {
      setError("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setError("Photo must be 2 MB or smaller.");
      return;
    }

    setPending(true);
    try {
      const presign = await fetch("/api/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId, contentType: file.type, size: file.size }),
      });
      const target = (await presign.json().catch(() => null)) as {
        uploadUrl?: string;
        key?: string;
        headers?: Record<string, string>;
        error?: string;
      } | null;
      if (!presign.ok || !target?.uploadUrl || !target.key) {
        setError(target?.error ?? "Could not start the upload.");
        return;
      }

      const upload = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: file });
      if (!upload.ok) {
        setError("The upload failed. Please try again.");
        return;
      }

      const saved = await fetch(`/api/employees/${employeeId}/photo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: target.key }),
      });
      if (!saved.ok) {
        const body = (await saved.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not save the photo.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not upload the photo. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={Object.keys(PHOTO_TYPES).join(",")}
        onChange={handleFile}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <Button variant="secondary" onClick={() => inputRef.current?.click()} loading={pending} loadingText="Uploading…">
        {hasPhoto ? "Change photo" : "Upload photo"}
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
