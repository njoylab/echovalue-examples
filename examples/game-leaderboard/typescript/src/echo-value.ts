/**
 * EchoValue key-value client for the leaderboard server.
 *
 * API reference: https://docs.echovalue.dev/key-value/
 * The token is only ever read on the server; it is never sent to the browser.
 */

const BASE_URL = "https://api.echovalue.dev";

// The API sits behind Cloudflare, which rejects requests that use a default
// runtime user agent (403 "error code: 1010"). Always send an explicit one.
const USER_AGENT = "echovalue-examples/1.0";

const MAX_VALUE_BYTES = 1000;

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface KeyValueStore {
  load(bucket: string, key: string): Promise<string>;
  save(bucket: string, key: string, value: string, ttl?: number): Promise<void>;
}

export class EchoValueError extends Error {}

export class KeyNotFoundError extends EchoValueError {}

export class InsufficientCreditsError extends EchoValueError {
  readonly rechargeUrl: string;

  constructor(message: string, rechargeUrl: string) {
    super(message);
    this.name = "InsufficientCreditsError";
    this.rechargeUrl = rechargeUrl;
  }
}

export class AuthError extends EchoValueError {}

export interface EchoValueClientOptions {
  token: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export class EchoValueClient implements KeyValueStore {
  readonly #token: string;
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;

  constructor(options: EchoValueClientOptions) {
    if (!options.token || options.token.length < 10) {
      throw new Error("ECHOVALUE_TOKEN must be at least 10 characters");
    }
    this.#token = options.token;
    this.#baseUrl = (options.baseUrl ?? BASE_URL).replace(/\/+$/, "");
    this.#fetch = options.fetchImpl ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
  }

  async load(bucket: string, key: string): Promise<string> {
    return this.#request("GET", this.#url(bucket, key));
  }

  async save(
    bucket: string,
    key: string,
    value: string,
    ttl = 2_592_000, // 30 days, the documented maximum
  ): Promise<void> {
    const bytes = new TextEncoder().encode(value).length;
    if (bytes > MAX_VALUE_BYTES) {
      throw new EchoValueError(
        `value is ${bytes} bytes; EchoValue allows ${MAX_VALUE_BYTES}`,
      );
    }
    await this.#request("POST", `${this.#url(bucket, key)}?ttl=${Math.trunc(ttl)}`, value);
  }

  #url(bucket: string, key: string): string {
    return `${this.#baseUrl}/kv/${bucket}/${key}`;
  }

  async #request(method: string, url: string, body?: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method,
        headers: {
          "x-token": this.#token,
          "User-Agent": USER_AGENT,
          "Content-Type": "text/plain; charset=utf-8",
        },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      throw new EchoValueError(
        `EchoValue request failed: ${(error as Error).message}`,
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    if (response.ok) {
      return text;
    }
    throw this.#errorFor(response.status, text.trim());
  }

  #errorFor(status: number, detail: string): EchoValueError {
    if (status === 401) {
      return new AuthError("EchoValue rejected the token (HTTP 401)");
    }
    if (status === 402) {
      const rechargeUrl = `${this.#baseUrl}/recharge`;
      return new InsufficientCreditsError(
        `EchoValue wallet is out of credits (HTTP 402). Recharge at ${rechargeUrl}`,
        rechargeUrl,
      );
    }
    if (status === 404) {
      return new KeyNotFoundError(`Key not found (HTTP 404): ${detail}`);
    }
    return new EchoValueError(`EchoValue error (HTTP ${status}): ${detail}`);
  }
}
