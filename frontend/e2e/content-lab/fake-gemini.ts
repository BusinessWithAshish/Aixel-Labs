import { createServer, type Server } from 'node:http';
import { E2E_GEMINI_API_BASE } from '../support/env';

/** Keys starting with this are accepted; any other key gets Google's "invalid key" answer. */
export const GOOD_KEY_PREFIX = 'AIzaGood';

/**
 * Google's `GET /v1beta/models` on `GEMINI_API_BASE` (this worker's port), enough for the key check
 * Content Lab runs before saving its own key. Records each key it was asked about.
 */
export class FakeGeminiKeyCheck {
    readonly keys: string[] = [];
    private constructor(private readonly server: Server) {}

    static async start(): Promise<FakeGeminiKeyCheck> {
        const fake: FakeGeminiKeyCheck = new FakeGeminiKeyCheck(
            createServer((req, res) => {
                const reply = (status: number, body: unknown) => {
                    res.writeHead(status, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(body));
                };
                const key = String(req.headers['x-goog-api-key'] ?? '');
                fake.keys.push(key);
                if (!req.url?.startsWith('/v1beta/models')) return reply(404, { error: { code: 404, message: 'Not found' } });
                if (key.startsWith(GOOD_KEY_PREFIX)) return reply(200, { models: [{ name: 'models/gemini-3.5-flash-lite' }] });
                reply(400, {
                    error: {
                        code: 400,
                        status: 'INVALID_ARGUMENT',
                        message: 'API key not valid. Please pass a valid API key.',
                        details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }],
                    },
                });
            }),
        );
        const { port } = new URL(E2E_GEMINI_API_BASE);
        await new Promise<void>((resolve) => fake.server.listen(Number(port), '127.0.0.1', resolve));
        return fake;
    }

    close(): Promise<void> {
        return new Promise((resolve) => this.server.close(() => resolve()));
    }
}
