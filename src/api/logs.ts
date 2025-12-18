import express, { Request, Response } from 'express'
import fs from 'fs'
import readline from 'readline'
import path from 'path'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { UserRole } from '@/entities/User'
import { ApiResponse } from '@/lib/apiResponse'
import { logger } from '@/lib/logger'

export const logsRouter = express.Router({ mergeParams: true })

const LOG_FILE_PATH = path.join(process.cwd(), 'logs', 'app.log')

// Helper function to read logs backwards
async function readLastLines(filePath: string, maxLines: number): Promise<any[]> {
  const lines: any[] = []

  if (!fs.existsSync(filePath)) {
    return []
  }

  const fileStream = fs.createReadStream(filePath)
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  })

  // We'll read all into memory for simplicity since log rotation isn't implemented effectively yet
  // For production with huge logs, we would want to seek from end.
  // Given the request, we'll implement a simple read-all and slice for now.

  for await (const line of rl) {
    try {
      if (line.trim()) {
        lines.push(JSON.parse(line))
      }
    } catch (e) {
      // Ignore parse errors (non-JSON lines)
    }
  }

  return lines.slice(-maxLines).reverse()
}

logsRouter.get(
  '/',
  requireAuth(),
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100
      const logs = await readLastLines(LOG_FILE_PATH, limit)

      res.json(ApiResponse.success({ logs }))
    } catch (error) {
      logger.error({ error }, 'Error accessing logs')
      res.status(500).json(ApiResponse.serverError('Could not retrieve logs'))
    }
  }
)
