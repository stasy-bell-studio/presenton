const resolvedImageCache = new Map<string, Promise<string | null>>();

export function isRemoteImageSource(src: string): boolean {
  try {
    const url = new URL(
      src,
      typeof window === "undefined" ? "http://localhost" : window.location.href,
    );
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function shouldResolveImageSource(src: string): boolean {
  const value = src.trim().toLowerCase();
  return Boolean(value) && !value.startsWith("data:");
}

export async function resolveImageSourceForExport(
  src: string,
): Promise<string | null> {
  if (!shouldResolveImageSource(src) || typeof fetch === "undefined") {
    return src;
  }
  const cached = resolvedImageCache.get(src);
  if (cached) return cached;

  const promise = fetchImageAsDataUri(src);
  resolvedImageCache.set(src, promise);
  return promise;
}

async function fetchImageAsDataUri(src: string): Promise<string | null> {
  try {
    const response = await fetch(src, {
      credentials: isRemoteImageSource(src) ? "omit" : "same-origin",
    });
    if (!response.ok) return null;

    const blob = await response.blob();
    if (blob.type && !blob.type.toLowerCase().startsWith("image/")) {
      return null;
    }
    return await blobToDataUri(blob);
  } catch {
    return null;
  }
}

function blobToDataUri(blob: Blob): Promise<string | null> {
  if (typeof FileReader === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}
