import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Local protocol fixture: no credentials or prompts leave the test machine. */
export async function startModelServer(): Promise<{
  url: string;
  requests: Array<{ model: string; prompt: string }>;
  close: () => Promise<void>;
}> {
  const requests: Array<{ model: string; prompt: string }> = [];
  let failed = false;
  const server: Server = createServer(async (req, res) => {
    if (
      req.method !== 'POST' ||
      req.url !== '/v1/chat/completions' ||
      req.headers.authorization !== 'Bearer local-fixture-only'
    ) {
      res.writeHead(400).end('Unexpected model protocol request');
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as {
      model: string;
      messages: Array<{ content: string }>;
    };
    const prompt = body.messages[0].content;
    requests.push({ model: body.model, prompt });
    if (body.model === 'qa-peer' && prompt.includes('FAIL_ONCE') && !failed) {
      failed = true;
      res.writeHead(503).end('Synthetic upstream outage');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `${body.model} 开始 ` } }] })}\n\n`);
    const timer = setTimeout(
      () => {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '中文回答完成' } }] })}\n\n`);
        res.end('data: [DONE]\n\n');
      },
      prompt.includes('SLOW') ? 20_000 : 250
    );
    res.on('close', () => clearTimeout(timer));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
