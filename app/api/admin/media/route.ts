import { db } from "@/lib/db";
import { handle, HttpError, ok } from "@/lib/http";
import { requireAdminApi } from "@/lib/session";
import { buildPath, storagePut } from "@/lib/storage";
import { sniffImage } from "@/lib/validation";

const MAX_BYTES = 4_000_000;
const TYPES = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" } as const;

/** Admin image upload for CMS content. Returns a public /api/media/<id> address. */
export const POST = handle(async (req) => {
  await requireAdminApi();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "The upload was incomplete. Please try again.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(422, "Choose an image file.");
  if (file.size <= 0 || file.size > MAX_BYTES) throw new HttpError(413, "Images must be smaller than 4 MB.");

  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) throw new HttpError(422, "Only JPEG, PNG, WebP or GIF images are accepted.");

  const ext = kind === "jpeg" ? "jpg" : kind;
  const stored = await storagePut(buildPath("media", `upload.${ext}`), bytes, TYPES[kind]);
  const record = await db.storedFile.create({
    data: {
      kind: "MEDIA",
      pathname: stored.pathname,
      url: stored.url,
      filename: `image.${ext}`,
      contentType: TYPES[kind],
      size: bytes.length,
    },
  });
  return ok({ url: `/api/media/${record.id}` }, 201);
});
