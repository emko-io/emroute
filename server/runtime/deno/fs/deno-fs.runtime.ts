import {
  CONTENT_TYPES,
  type FetchParams,
  type FetchReturn,
  Runtime,
} from "../../abstract.runtime.ts";

export class DenoFsRuntime extends Runtime {
  private readonly root: string;

  constructor(root: string) {
    super();
    this.root = root.endsWith("/") ? root.slice(0, -1) : root;
  }

  async handle(
    resource: FetchParams[0],
    init?: FetchParams[1],
  ): FetchReturn {
    const [pathname, method, body] = this.parse(resource, init);
    const path = `${this.root}${pathname}`;

    switch (method) {
      case "PUT":
        return this.write(path, body);
      default:
        return this.read(path);
    }
  }

  query(
    resource: FetchParams[0],
    options: FetchParams[1] & { as: "text" },
  ): Promise<string>;
  query(
    resource: FetchParams[0],
    options?: FetchParams[1],
  ): FetchReturn;
  async query(
    resource: FetchParams[0],
    options?: FetchParams[1] & { as?: "text" },
  ): Promise<Response | string> {
    if (options?.as === "text") {
      const pathname = this.parsePath(resource);
      return Deno.readTextFile(`${this.root}${pathname}`);
    }
    return this.handle(resource, options);
  }

  private parsePath(resource: FetchParams[0]): string {
    if (typeof resource === "string") return resource;
    if (resource instanceof URL) return resource.pathname;
    return new URL(resource.url).pathname;
  }

  private parse(
    resource: FetchParams[0],
    init?: RequestInit,
  ): [string, string, BodyInit | null] {
    const pathname = this.parsePath(resource);
    if (typeof resource === "string" || resource instanceof URL) {
      return [pathname, init?.method ?? "GET", init?.body ?? null];
    }
    return [
      pathname,
      init?.method ?? resource.method,
      init?.body ?? resource.body,
    ];
  }

  private async read(path: string): Promise<Response> {
    try {
      const info = await Deno.stat(path);

      if (info.isDirectory) {
        return this.list(path);
      }

      const content = await Deno.readFile(path);
      const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
      const headers: HeadersInit = {
        "Content-Type": CONTENT_TYPES.get(ext) ?? "application/octet-stream",
        "Content-Length": content.byteLength.toString(),
      };

      if (info.mtime) {
        headers["Last-Modified"] = info.mtime.toUTCString();
      }

      return new Response(content, { status: 200, headers });
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return new Response("Not Found", { status: 404 });
      }
      return new Response(`Internal Error: ${error}`, { status: 500 });
    }
  }

  private async list(path: string): Promise<Response> {
    const entries: string[] = [];
    for await (const entry of Deno.readDir(path)) {
      entries.push(entry.name + (entry.isDirectory ? "/" : ""));
    }
    return Response.json(entries);
  }

  private async write(path: string, body: BodyInit | null): Promise<Response> {
    try {
      const content = body
        ? new Uint8Array(await new Response(body).arrayBuffer())
        : new Uint8Array();
      await Deno.writeFile(path, content);
      return new Response(null, { status: 204 });
    } catch (error) {
      return new Response(`Write failed: ${error}`, { status: 500 });
    }
  }

  static override transpile(ts: string): string {
    return "";
  }
}
