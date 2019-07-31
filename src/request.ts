import { IncomingMessage, request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { Readable } from 'stream'
import { URL } from 'url'

export type HTTPMethod =
  | 'OPTIONS'
  | 'GET'
  | 'HEAD'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'TRACE'
  | 'PATCH'

export interface HTTPResponse {
  statusCode: number
  statusMessage?: string
  headers: Record<string, string>

  raw(): Promise<Buffer>
  text(): Promise<string>
  json(): Promise<object | boolean>
}

const awaitReadableStream = async (readable: Readable): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    let data = Buffer.from('')

    readable.on('data', (chunk: Buffer) => {
      data = Buffer.concat([data, chunk])
    })

    readable.on('error', (e) => reject(e))

    readable.on('end', () => {
      resolve(data)
    })
  })
}

export const request = async (
  method: HTTPMethod,
  url: string | URL,
  headers: Record<string, string> = {},
  body?: string | Buffer
): Promise<HTTPResponse> => {
  const parsedUrl = url instanceof URL ? url : new URL(url)
  const requestFn = parsedUrl.protocol === 'https:' ? httpsRequest : httpRequest
  const clientRequest = requestFn(url, {
    method,
    headers,
  })

  const incomingMessage = await new Promise<IncomingMessage>(
    (resolve, reject) => {
      try {
        clientRequest.on('response', (res: IncomingMessage) => {
          resolve(res)
        })

        clientRequest.on('error', (e) => {
          reject(e)
        })

        clientRequest.on('timeout', () => {
          clientRequest.abort()
          reject(new Error('TIMEOUT: Request timed out'))
        })

        if (body) {
          clientRequest.write(body)
        }
        clientRequest.end()
      } catch (e) {
        reject(e)
      }
    }
  )

  const payloadPromise = awaitReadableStream(incomingMessage)
  return {
    statusCode: incomingMessage.statusCode || 0,
    statusMessage: incomingMessage.statusMessage,
    headers: Object.entries(incomingMessage.headers).reduce<
      Record<string, string>
    >(
      (partialHeaders, [header, value]) => ({
        ...partialHeaders,
        [header]:
          typeof value === 'string'
            ? value
            : Array.isArray(value)
            ? value.join(', ')
            : '',
      }),
      {}
    ),
    raw: async () => payloadPromise,
    text: async (encoding = 'utf8') => {
      const payload = await payloadPromise
      return payload.toString(encoding)
    },
    json: async () => {
      const payload = await payloadPromise
      const stringifiedPayload = payload.toString()
      return JSON.parse(stringifiedPayload)
    },
  }
}
