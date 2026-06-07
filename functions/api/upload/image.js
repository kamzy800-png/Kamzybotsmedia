// Cloudflare Pages Function — POST /api/upload/image
// Accepts multipart/form-data with a "file" field.
// Auto-creates the "product-images" Supabase Storage bucket on first use,
// then uploads and returns the public URL.

const BUCKET = "product-images";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function ensureBucket(supabaseUrl, serviceKey) {
  await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
}

export async function onRequestPost({ request, env }) {
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
  const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Storage not configured on server" }, 503);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "Invalid multipart request" }, 400);
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") return json({ error: "No file provided" }, 400);
  if (!file.type.startsWith("image/"))    return json({ error: "Only image files are allowed" }, 400);
  if (file.size > 5 * 1024 * 1024)        return json({ error: "Image must be 5 MB or smaller" }, 400);

  const ext      = (file.name.split(".").pop() || "jpg").toLowerCase();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

  await ensureBucket(supabaseUrl, serviceKey);

  const bytes     = await file.arrayBuffer();
  const uploadRes = await fetch(
    `${supabaseUrl}/storage/v1/object/${BUCKET}/${fileName}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": file.type,
        "x-upsert": "true",
      },
      body: bytes,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    return json({ error: err.error || err.message || "Upload failed" }, uploadRes.status);
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${fileName}`;
  return json({ url: publicUrl });
}
