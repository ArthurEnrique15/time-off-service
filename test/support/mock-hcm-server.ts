import { differenceInCalendarDays, parseISO } from 'date-fns';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

type MockBalance = {
  employeeId: string;
  locationId: string;
  availableDays: number;
};

type MockRequest = {
  id: string;
  employeeId: string;
  locationId: string;
  startDate: string;
  endDate: string;
};

type MockHcmServerOptions = {
  balances?: MockBalance[];
  requests?: MockRequest[];
};

const parseBody = async (request: IncomingMessage): Promise<any> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }

  const raw = Buffer.concat(chunks).toString();

  return raw ? JSON.parse(raw) : {};
};

const json = (response: ServerResponse, statusCode: number, body: any): void => {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

export const startMockHcmServer = async (options: MockHcmServerOptions = {}) => {
  const balanceStore = new Map<string, MockBalance>();
  const requestStore = new Map<string, MockRequest>();

  for (const balance of options.balances ?? []) {
    balanceStore.set(`${balance.employeeId}:${balance.locationId}`, balance);
  }

  for (const req of options.requests ?? []) {
    requestStore.set(req.id, req);
  }

  let requestCounter = 0;

  const server = createServer(async (request, response) => {
    const url = request.url ?? '';
    const method = request.method ?? '';

    // GET /health
    if (method === 'GET' && url === '/health') {
      json(response, 200, { status: 'ok' });

      return;
    }

    // GET /balances — bulk export (must be registered before the /:eid/:lid regex handler)
    if (method === 'GET' && url === '/balances') {
      const handler = (server as any).handlers?.getBalancesBulk;
      if (handler) {
        handler(request, response);
      } else {
        // Default: return all balances
        const balances = Array.from(balanceStore.values());
        json(response, 200, balances);
      }

      return;
    }

    // GET /balances/:employeeId/:locationId
    const balanceMatch = url.match(/^\/balances\/([^/]+)\/([^/]+)$/);

    if (method === 'GET' && balanceMatch) {
      const [, employeeId, locationId] = balanceMatch;
      const key = `${employeeId}:${locationId}`;
      const balance = balanceStore.get(key);

      if (!balance) {
        json(response, 404, {
          error: 'INVALID_DIMENSIONS',
          message: `No balance found for employee ${employeeId} at location ${locationId}`,
        });

        return;
      }

      json(response, 200, {
        employeeId: balance.employeeId,
        locationId: balance.locationId,
        availableDays: balance.availableDays,
      });

      return;
    }

    // POST /time-off-requests
    if (method === 'POST' && url === '/time-off-requests') {
      const body = await parseBody(request);
      const key = `${body.employeeId}:${body.locationId}`;
      const balance = balanceStore.get(key);

      if (!balance) {
        json(response, 400, {
          error: 'INVALID_DIMENSIONS',
          message: `No balance found for employee ${body.employeeId} at location ${body.locationId}`,
        });

        return;
      }

      const startDate = parseISO(body.startDate);
      const endDate = parseISO(body.endDate);
      const daysRequested = differenceInCalendarDays(endDate, startDate) + 1;

      if (balance.availableDays < daysRequested) {
        json(response, 400, {
          error: 'INSUFFICIENT_BALANCE',
          message: `Requested ${daysRequested} days but only ${balance.availableDays} available`,
        });

        return;
      }

      requestCounter++;
      const id = `hcm-req-${requestCounter}`;

      requestStore.set(id, {
        id,
        employeeId: body.employeeId,
        locationId: body.locationId,
        startDate: body.startDate,
        endDate: body.endDate,
      });

      balance.availableDays -= daysRequested;

      json(response, 201, { id, status: 'APPROVED' });

      return;
    }

    // DELETE /time-off-requests/:requestId
    const deleteMatch = url.match(/^\/time-off-requests\/([^/]+)$/);

    if (method === 'DELETE' && deleteMatch) {
      const [, requestId] = deleteMatch;
      const storedRequest = requestStore.get(requestId);

      if (!storedRequest) {
        json(response, 404, {
          error: 'NOT_FOUND',
          message: `Time-off request ${requestId} not found`,
        });

        return;
      }

      const startDate = parseISO(storedRequest.startDate);
      const endDate = parseISO(storedRequest.endDate);
      const daysRequested = differenceInCalendarDays(endDate, startDate) + 1;
      const key = `${storedRequest.employeeId}:${storedRequest.locationId}`;
      const balance = balanceStore.get(key);

      if (balance) {
        balance.availableDays += daysRequested;
      }

      requestStore.delete(requestId);
      response.writeHead(204);
      response.end();

      return;
    }

    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Unable to determine mock HCM server address');
  }

  // Attach handlers object to server for tests to register custom behavior
  (server as any).handlers = {
    getBalancesBulk: undefined as ((request: IncomingMessage, response: ServerResponse) => void) | undefined,
  };

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    handlers: (server as any).handlers,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);

            return;
          }

          resolve();
        });
      });
    },
  };
};
