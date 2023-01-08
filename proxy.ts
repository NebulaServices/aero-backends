export default class {
	prefix: string;
	wsPrefix: string;
	debug: boolean;

	constructor(prefix: string, wsPrefix: string, debug?: boolean) {
		this.prefix = prefix;
		this.wsPrefix = wsPrefix;
		this.debug = debug ?? false;
	}
	route(path: string): boolean {
		return path === this.prefix;
	}
	routeWs(path: string): boolean {
		return path.startsWith(this.wsPrefix);
	}
	async handle(req: Request): Promise<Response> {
		const url: string = req.headers.get("x-url") || "";

		// deno-lint-ignore ban-types
		const headers: Object = JSON.parse(req.headers.get("x-headers") || "");

		if (this.debug) console.log(`Handling ${url}`);

		try {
			const opts: {
				method: string;
				// deno-lint-ignore no-explicit-any
				headers: any;
				body?: string;
			} = {
				method: req.method,
				headers: headers,
			};

			if (opts.method === "POST") {
				opts.body = await req.text();

				console.log(`${req.method} ${url}`);
			}

			const proxyResp: Response = await fetch(url, opts);

			const respHeaders = Object.fromEntries(proxyResp.headers.entries());

			// Don't cache
			delete respHeaders["age"];
			delete respHeaders["cache-control"];
			delete respHeaders["expires"];

			return new Response(await proxyResp.body, {
				status: proxyResp.status,
				headers: {
					"cache-control": "no-cache",
					...respHeaders,
				},
			});
		} catch (err) {
			return new Response(err.message, { status: 500 });
		}
	}
	handleWs(req: Request): Response {
		let resp: Response, sock: WebSocket;

		const proto: string = req.headers.get("sec-websocket-protocol") || "";

		try {
			({ response: resp, socket: sock } = Deno.upgradeWebSocket(req, {
				protocol: proto,
			}));
		} catch {
			return new Response("Not a WS connection");
		}

		const url: string = new URL(req.url).searchParams.get("url") || "";

		if (this.debug) console.log(`Handling WS ${url}`);

		const proxySock = new WebSocket(url, proto);

		sock.onmessage = e => proxySock.send(e.data);
		proxySock.onmessage = e => sock.send(e.data);

		sock.onclose = () => proxySock.close();
		proxySock.onclose = () => sock.close();

		return resp;
	}
}
