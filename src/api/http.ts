// src/api/http.ts
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:5000";

function getToken(): string | null {
  return localStorage.getItem("token");
}


async function parseBody(res: Response): Promise<any> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return await res.json().catch(() => null);
  }
  const text = await res.text().catch(() => "");
  return text ? { message: text } : null;
}

export async function http<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers ?? {}),
  };

  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // JWT only (backend blocks direct access without Bearer token)

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await parseBody(res);

  // IMPORTANT:
  // - si status non-2xx, on throw MAIS en gardant le body structuré
  // - le catch côté appelant peut lire e.body
  if (!res.ok) {
    const err: any = new Error(body?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body as T;
}

// ---------------------------------------------------------------------------
// Téléchargements (PDF, ZIP, etc.)
// ---------------------------------------------------------------------------

export async function httpBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:5000";

  const headers: HeadersInit = {
    ...(options.headers ?? {}),
  };

  const token = localStorage.getItem("token");
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // JWT only

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    // on tente de lire un body JSON ou texte pour un message utile
    let message = `HTTP ${res.status}`;
    try {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const b: any = await res.json();
        message = b?.message ?? message;
      } else {
        const t = await res.text();
        if (t) message = t;
      }
    } catch {
      // ignore
    }
    const err: any = new Error(message);
    err.status = res.status;
    throw err;
  }
  return await res.blob();
}

// src/api/http.ts
export async function httpOk<T>(path: string, options: RequestInit = {}): Promise<T> {
  const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:5000";

  function getToken(): string | null {
    return localStorage.getItem("token");
  }


  async function parseBody(res: Response): Promise<any> {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return await res.json().catch(() => null);
    const text = await res.text().catch(() => "");
    return text ? { message: text } : null;
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers ?? {}),
  };

  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // JWT only

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await parseBody(res);

  if (!res.ok) {
    const err: any = new Error(body?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body as T;
}

