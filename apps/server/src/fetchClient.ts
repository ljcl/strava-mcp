export class HttpError extends Error {
  response: {
    status: number;
    statusText: string;
    data: string;
  };

  constructor(
    message: string,
    response: { status: number; statusText: string; data: string },
  ) {
    super(message);
    this.name = "HttpError";
    this.response = response;
  }
}

interface FetchConfig {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  data?: unknown;
  method?: string;
  responseType?: "json" | "text";
}

interface RequestInterceptor {
  onFulfilled?: (
    config: FetchConfig & { url: string },
  ) => FetchConfig & { url: string };
  onRejected?: (error: Error) => Promise<Error>;
}

class FetchClient {
  private baseURL: string;
  private requestInterceptors: RequestInterceptor[] = [];

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  get interceptors() {
    return {
      request: {
        use: (
          onFulfilled?: RequestInterceptor["onFulfilled"],
          onRejected?: RequestInterceptor["onRejected"],
        ) => {
          this.requestInterceptors.push({ onFulfilled, onRejected });
        },
      },
    };
  }

  private async request<T>(
    url: string,
    config: FetchConfig = {},
  ): Promise<{ data: T }> {
    const fullUrl = url.startsWith("http") ? url : `${this.baseURL}${url}`;

    // Apply request interceptors
    let requestConfig = { ...config, url: fullUrl };
    for (const interceptor of this.requestInterceptors) {
      if (interceptor.onFulfilled) {
        try {
          requestConfig = interceptor.onFulfilled(requestConfig);
        } catch (error) {
          if (interceptor.onRejected) {
            await interceptor.onRejected(error as Error);
          }
          throw error;
        }
      }
    }

    // Build URL with query params
    if (requestConfig.params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(requestConfig.params)) {
        searchParams.append(key, String(value));
      }
      const separator = requestConfig.url.includes("?") ? "&" : "?";
      requestConfig.url = `${requestConfig.url}${separator}${searchParams.toString()}`;
    }

    // Build fetch options
    const fetchOptions: RequestInit = {
      method: requestConfig.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...requestConfig.headers,
      },
    };

    if (requestConfig.data) {
      fetchOptions.body = JSON.stringify(requestConfig.data);
    }

    // Make the request
    const response = await fetch(requestConfig.url, fetchOptions);

    // Handle errors
    if (!response.ok) {
      const errorText = await response.text();
      throw new HttpError(`HTTP ${response.status}: ${errorText}`, {
        status: response.status,
        statusText: response.statusText,
        data: errorText,
      });
    }

    // Parse response
    let data: T;
    if (requestConfig.responseType === "text") {
      data = (await response.text()) as T;
    } else {
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        data = await response.json();
      } else {
        data = (await response.text()) as T;
      }
    }

    return { data };
  }

  async get<T>(url: string, config?: FetchConfig): Promise<{ data: T }> {
    return this.request<T>(url, { ...config, method: "GET" });
  }

  async post<T>(
    url: string,
    data?: unknown,
    config?: FetchConfig,
  ): Promise<{ data: T }> {
    return this.request<T>(url, { ...config, data, method: "POST" });
  }

  async put<T>(
    url: string,
    data?: unknown,
    config?: FetchConfig,
  ): Promise<{ data: T }> {
    return this.request<T>(url, { ...config, data, method: "PUT" });
  }

  async delete<T>(url: string, config?: FetchConfig): Promise<{ data: T }> {
    return this.request<T>(url, { ...config, method: "DELETE" });
  }
}

// Create an instance for Strava API
export const stravaApi = new FetchClient("https://www.strava.com/api/v3");

// Add request interceptor
stravaApi.interceptors.request.use(
  (config) => {
    // Request logging is commented out to avoid interfering with MCP Stdio transport
    return config;
  },
  (error) => {
    console.error("[DEBUG fetchClient] Request Error Interceptor:", error);
    return Promise.reject(error);
  },
);
