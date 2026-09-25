"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/input";
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/validations/employee";

// Whose photo this controls: "self" (My profile, any role) uses /api/me/photo,
// which takes the employee from the session; { employeeId } is the admin flow.
export type PhotoTarget = "self" | { employeeId: string };

function endpointsFor(target: PhotoTarget) {
  if (target === "self") {
    return { uploadUrl: "/api/me/photo/upload-url", photo: "/api/me/photo", extra: {} };
  }
  return {
    uploadUrl: "/api/upload",
    photo: `/api/employees/${target.employeeId}/photo`,
    extra: { employeeId: target.employeeId },
  };
}

// Change or remove a photo. Only rendered when R2 storage is configured.
// Upload: 1) ask the server for a presigned upload URL, 2) upload straight to
// R2, 3) ask the server to verify and save it. router.refresh() then re-renders
// the page and the layout, so every avatar (sidebar, mobile bar, Account sheet)
// picks up the change.
export function PhotoUpload({ target, hasPhoto }: { target: PhotoTarget; hasPhoto: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const endpoints = endpointsFor(target);

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

    setPending("upload");
    try {
      const presign = await fetch(endpoints.uploadUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...endpoints.extra, contentType: file.type, size: file.size }),
      });
      const upload = (await presign.json().catch(() => null)) as {
        uploadUrl?: string;
        key?: string;
        headers?: Record<string, string>;
        error?: string;
      } | null;
      if (!presign.ok || !upload?.uploadUrl || !upload.key) {
        setError(upload?.error ?? "Could not start the upload.");
        return;
      }

      const put = await fetch(upload.uploadUrl, { method: "PUT", headers: upload.headers, body: file });
      if (!put.ok) {
        setError("The upload failed. Please try again.");
        return;
      }

      const saved = await fetch(endpoints.photo, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: upload.key }),
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
      setPending(null);
    }
  }

  async function handleRemove() {
    setPending("remove");
    setError(null);
    try {
      const response = await fetch(endpoints.photo, { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not remove the photo.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Could not remove the photo. Check your connection and try again.");
    } finally {
      setPending(null);
      setConfirmRemove(false);
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
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          loading={pending === "upload"}
          loadingText="Uploading…"
          disabled={pending !== null}
        >
          {hasPhoto ? "Change photo" : "Upload photo"}
        </Button>
        {hasPhoto && (
          <Button
            variant="ghost"
            onClick={() => {
              setError(null);
              setConfirmRemove(true);
            }}
            disabled={pending !== null}
          >
            Remove photo
          </Button>
        )}
      </div>
      <FieldError>{error}</FieldError>

      <Dialog open={confirmRemove} onClose={() => pending === null && setConfirmRemove(false)} title="Remove photo">
        <div className="space-y-5">
          <p className="text-[15px] text-muted">
            {target === "self"
              ? "Your photo will be deleted and your initials shown instead. You can upload a new photo at any time."
              : "This employee's photo will be deleted and their initials shown instead. You can upload a new photo at any time."}
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setConfirmRemove(false)} disabled={pending !== null}>
              Cancel
            </Button>
            <Button onClick={handleRemove} loading={pending === "remove"} loadingText="Removing…">
              Remove photo
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
