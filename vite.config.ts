import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { callAssistant, isConfigured, type AssistantConfig } from './server/assistant.js'

// Dev-server mount for the assistant proxy; the deployed demo mounts the same
// handler as a serverless function. GET reports availability, POST forwards.
function assistantProxy(cfg: AssistantConfig): Plugin {
  return {
    name: 'assistant-proxy',
    configureServer(server) {
      server.middlewares.use('/api/assistant', (req, res) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ configured: isConfigured(cfg) }))
          return
        }
        let raw = ''
        req.on('data', (chunk) => (raw += chunk))
        req.on('end', () => {
          let parsed: unknown
          try {
            parsed = JSON.parse(raw)
          } catch {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'invalid JSON' }))
            return
          }
          callAssistant(cfg, parsed).then(
            ({ status, body }: { status: number; body: string }) => {
              res.statusCode = status
              res.setHeader('Content-Type', 'application/json')
              res.end(body)
            },
            (err: Error) => {
              res.statusCode = 502
              res.end(JSON.stringify({ error: err.message }))
            },
          )
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: env.PAGES_BASE || '/',
    plugins: [
      react(),
      assistantProxy({
        baseUrl: env.LLM_BASE_URL,
        authToken: env.LLM_API_KEY,
        model: env.LLM_MODEL,
      }),
    ],
  }
})
