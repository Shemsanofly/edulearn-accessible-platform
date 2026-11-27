/** Small typed fetch wrapper. Throws ApiError with the server's friendly message. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, string>,
  ) {
    super(message);
  }
}

type Params = Record<string, string | number | boolean | null | undefined>;

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

function buildUrl(path: string, params?: Params) {
  const url = new URL(`/api${path}`, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.pathname + url.search;
}

async function request<T>(method: string, path: string, body?: unknown, params?: Params): Promise<T> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, params), {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized?.();
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data.details);
  }
  return data as T;
}

/** Upload a raw file body (photos, logos, attachments). */
async function upload<T>(method: 'PUT' | 'POST', path: string, body: Blob, contentType: string): Promise<T> {
  const res = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: { 'Content-Type': contentType }, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 413) throw new ApiError(413, 'That file is too large.');
    throw new ApiError(res.status, data.error ?? `Upload failed (${res.status})`, data.details);
  }
  return data as T;
}

/** Download a file from the API (Excel templates and exports) and hand it to the browser. */
async function download(path: string, params?: Params) {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, params), { credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(res.status, data.error ?? `Download failed (${res.status})`, data.details);
  }
  const blob = await res.blob();
  const header = res.headers.get('content-disposition') ?? '';
  const name = /filename\*=UTF-8''([^;]+)/.exec(header)?.[1] ?? /filename="([^"]+)"/.exec(header)?.[1] ?? 'download.xlsx';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = decodeURIComponent(name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return a.download;
}

export const api = {
  upload,
  download,
  get: <T>(path: string, params?: Params) => request<T>('GET', path, undefined, params),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T = void>(path: string) => request<T>('DELETE', path),
};

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong. Please try again.';
