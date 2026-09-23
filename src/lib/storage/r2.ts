import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 through its S3-compatible API. Private bucket: objects are
// only reachable through short-lived presigned URLs created on the server.
// The client is created lazily, so nothing here needs R2 env vars until a
// photo feature is actually used; isStorageConfigured() lets callers hide
// photo features when R2 is not set up.

const R2_ENV = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

const UPLOAD_URL_TTL_SECONDS = 5 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

export function isStorageConfigured(): boolean {
  return R2_ENV.every((name) => !!process.env[name]?.trim());
}

type Storage = { client: S3Client; bucket: string };
let cached: Storage | undefined;

function getStorage(): Storage {
  if (cached) return cached;
  if (!isStorageConfigured()) {
    throw new Error("Photo storage is not configured (R2_* environment variables are missing).");
  }
  const env = (name: (typeof R2_ENV)[number]) => process.env[name]!.trim();
  cached = {
    bucket: env("R2_BUCKET"),
    client: new S3Client({
      region: "auto",
      endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      // Path-style URLs: https://<account>.r2.cloudflarestorage.com/<bucket>/<key>
      forcePathStyle: true,
      credentials: {
        accessKeyId: env("R2_ACCESS_KEY_ID"),
        secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
      },
      // R2 does not support the SDK's default flexible checksums on presigned
      // uploads; only send checksums when an operation requires them.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
  };
  return cached;
}

// Presigned PUT URL. Content-Type and Content-Length are signed, so the
// browser must upload exactly the declared type and size.
export async function createPresignedUpload(key: string, contentType: string, size: number) {
  const { client, bucket } = getStorage();
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: size }),
    {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
      signableHeaders: new Set(["content-type", "content-length"]),
    },
  );
  return { url, headers: { "Content-Type": contentType }, expiresIn: UPLOAD_URL_TTL_SECONDS };
}

// Short-lived presigned GET URL for displaying a private object.
export async function createPresignedDownload(key: string): Promise<string> {
  const { client, bucket } = getStorage();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
  });
}

// Size and type of an uploaded object, or null if it does not exist.
export async function getObjectInfo(
  key: string,
): Promise<{ size: number; contentType: string | undefined } | null> {
  const { client, bucket } = getStorage();
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: head.ContentLength ?? 0, contentType: head.ContentType };
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw error;
  }
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = getStorage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
