export type Profile = {
  id: string;
  email: string;
  role: 'admin' | 'user';
  is_blocked: boolean;
  access_approved: boolean;
  email_verified: boolean;
  created_at: string;
};

export type Category = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type AppCard = {
  id: string;
  category_id: string;
  name: string;
  link: string;
  created_at: string;
  updated_at: string;
};

export type AccessRequest = {
  id: string;
  email: string;
  status: 'pending' | 'accepted' | 'declined';
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const TOKEN_KEY = 'hub_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

async function request<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json().catch(() => ({})) : await response.text();

  if (!response.ok) {
    const errorMsg =
      typeof data === 'object' && data !== null && 'error' in data
        ? String(data.error)
        : typeof data === 'object' && data !== null && 'message' in data
        ? String(data.message)
        : `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data as T;
}

export const api = {
  async login(payload: { email: string; password: string }): Promise<{ user: Profile; token: string }> {
    const res = await request<{ user: Profile; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token) setStoredToken(res.token);
    return res;
  },

  async signup(payload: { email: string; password: string }): Promise<{ user?: Profile; token?: string; message: string }> {
    const res = await request<{ user?: Profile; token?: string; message: string }>('/api/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token) setStoredToken(res.token);
    return res;
  },

  async me(): Promise<{ user: Profile }> {
    return request<{ user: Profile }>('/api/auth/me', {
      method: 'GET',
    });
  },

  async logout(): Promise<void> {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } finally {
      setStoredToken(null);
    }
  },

  async requestPasswordReset(payload: { email: string }): Promise<{ message: string }> {
    return request<{ message: string }>('/api/auth/password-reset', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async resetPassword(payload: { token: string; password: string }): Promise<{ message: string }> {
    return request<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async submitAccessRequest(payload: { email: string }): Promise<{ message: string }> {
    return request<{ message: string }>('/api/auth/access-requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getCategories(): Promise<Category[]> {
    return request<Category[]>('/api/categories', {
      method: 'GET',
    });
  },

  async createCategory(payload: { name: string }): Promise<Category> {
    return request<Category>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateCategory(id: string, payload: { name: string }): Promise<Category> {
    return request<Category>(`/api/categories/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deleteCategory(id: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/api/categories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async getAppCards(): Promise<AppCard[]> {
    return request<AppCard[]>('/api/app-cards', {
      method: 'GET',
    });
  },

  async createAppCard(payload: { name: string; link: string; category_id: string }): Promise<AppCard> {
    return request<AppCard>('/api/app-cards', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateAppCard(
    id: string,
    payload: { name?: string; link?: string; category_id?: string },
  ): Promise<AppCard> {
    return request<AppCard>(`/api/app-cards/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deleteAppCard(id: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/api/app-cards/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async getAccessRequests(): Promise<AccessRequest[]> {
    return request<AccessRequest[]>('/api/auth/access-requests', {
      method: 'GET',
    });
  },

  async reviewAccessRequest(
    id: string,
    decision: 'accept' | 'decline',
  ): Promise<{ message: string }> {
    return request<{ message: string }>(
      `/api/auth/access-requests/${encodeURIComponent(id)}/decision`,
      {
        method: 'POST',
        body: JSON.stringify({ decision }),
      },
    );
  },

  async getUsers(): Promise<Profile[]> {
    return request<Profile[]>('/api/admin/users', {
      method: 'GET',
    });
  },

  async setUserBlocked(
    userId: string,
    blocked: boolean,
  ): Promise<{ message: string }> {
    return request<{ message: string }>(
      `/api/admin/users/${encodeURIComponent(userId)}/blocked`,
      {
        method: 'PATCH',
        body: JSON.stringify({ blocked }),
      },
    );
  },

  async inviteUser(payload: { email: string }): Promise<{ message: string }> {
    return request<{ message: string }>('/api/auth/invite', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async checkHealth(): Promise<{ status: string }> {
    return request<{ status: string }>('/api/healthz', {
      method: 'GET',
    });
  },
};
