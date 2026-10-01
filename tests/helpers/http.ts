import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp } from '@/app'
import { DI } from '@/di'
import type { User } from '@/entities/User'
import { generateAccessToken } from '@/lib/tokenUtils'

export interface TestResponse {
  status: number
  body: unknown
}

export interface TestApp {
  request: (method: string, path: string, options?: { as?: User; body?: unknown }) => Promise<TestResponse>
  close: () => Promise<void>
}

/** Starts the real Express app (all middleware and routes) on a random port, without Redis or sockets. */
export const startTestApp = async (): Promise<TestApp> => {
  const server = http.createServer(createApp(DI))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const baseUrl = `http://127.0.0.1:${port}`

  return {
    request: async (method, path, options = {}) => {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (options.as) {
        // The same token the login route issues
        const token = generateAccessToken({ email: options.as.email, id: options.as.id, role: options.as.role })
        headers.authorization = `Bearer ${token}`
      }
      const response = await fetch(baseUrl + path, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      })
      const text = await response.text()
      let body: unknown = text
      try {
        body = JSON.parse(text)
      } catch {
        // not JSON: keep the raw text
      }
      return { status: response.status, body }
    },
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  }
}
