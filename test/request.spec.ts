import { createServer } from 'http'
import test from 'tape'
import { request } from '../src/request'

interface TestServer {
  reset(): this
  expect(
    method: string,
    url: string,
    headers?: Record<string, string> | undefined,
    payload?: string | undefined
  ): this
  respond(
    status: number,
    message?: string | undefined,
    headers?: Record<string, string>,
    body?: string
  ): this
  close(): void
}

const createTestServer = (t: test.Test, createServerFn = createServer) => {
  let expectation:
    | {
        method: string
        url: string
        respond?: {
          status: number
          message?: string
          headers: Record<string, string>
          body: string
        }
        headers?: Record<string, string>
        payload?: string
      }
    | undefined

  return new Promise<TestServer>((resolve) => {
    const listener = createServerFn(async (req, res) => {
      if (!expectation) {
        t.fail('No request expected')
        res.writeHead(404, 'No request expected')
        return res.end('No request expected')
      }

      t.is(
        req.method,
        expectation.method,
        `sent a ${expectation.method} request`
      )

      t.is(req.url, expectation.url, `sent a request to ${expectation.url}`)

      if (expectation.headers) {
        Object.entries(expectation.headers).forEach(([header, value]) => {
          t.is(
            req.headers[header.toLowerCase()],
            value,
            `sent header '${header}' with value '${value}'`
          )
        })
      }

      if (expectation.payload) {
        const payload = await new Promise((r) => {
          let data = ''
          req.setEncoding('utf8')
          req.on('data', (chunk) => (data += chunk))
          req.on('end', () => r(data))
        })

        t.is(payload, expectation.payload, 'sent the correct payload')
      }

      const response = expectation.respond || {
        status: 204,
        message: 'No Content',
        headers: {},
        body: '',
      }
      res.writeHead(response.status, response.headers)
      res.end(response.body)
    }).listen(3333, () => {
      const testServer = {
        reset() {
          expectation = undefined
          return testServer
        },
        expect(
          method: string,
          url: string,
          headers?: Record<string, string>,
          payload?: string
        ) {
          expectation = {
            ...expectation,
            method,
            url,
            headers,
            payload,
          }
          return testServer
        },
        respond(
          status: number,
          message?: string,
          headers: Record<string, string> = {},
          body = ''
        ) {
          if (!expectation) {
            throw new Error('No request expected')
          }
          expectation.respond = {
            status,
            message,
            headers,
            body,
          }
          return testServer
        },
        close() {
          listener.close()
        },
      }
      resolve(testServer)
    })
  })
}

test('requests', async (t) => {
  const testServer = await createTestServer(t)

  testServer.expect('GET', '/')
  const response1 = await request('GET', 'http://localhost:3333/')
  t.is(response1.statusCode, 204, 'returns a 204 status code')

  testServer
    .expect(
      'POST',
      '/form',
      { 'Content-Type': 'application/json' },
      '{"field":"value"}'
    )
    .respond(
      201,
      'Created',
      { 'Content-Type': 'application/json' },
      '{"status":"created"}'
    )
  const response2 = await request(
    'POST',
    'http://localhost:3333/form',
    { 'Content-Type': 'application/json' },
    JSON.stringify({ field: 'value' })
  )
  t.is(response2.statusCode, 201, 'returns a 201 status code')
  t.is(
    response2.headers['content-type'],
    'application/json',
    'returns an application/json content-type'
  )
  const rawPayload2 = await response2.raw()
  t.deepEquals(
    rawPayload2,
    Buffer.from(JSON.stringify({ status: 'created' })),
    'returns the correct Buffer type body'
  )

  const textPayload2 = await response2.text()
  t.is(
    textPayload2,
    JSON.stringify({ status: 'created' }),
    'returns the correct text type payload'
  )

  const jsonPayload2 = await response2.json()
  t.deepEquals(
    jsonPayload2,
    { status: 'created' },
    'returns the correct JSON payload'
  )

  testServer.close()
  t.end()
})
