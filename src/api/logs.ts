import express, { Request, Response } from 'express'
import fs from 'fs'
import readline from 'readline'
import path from 'path'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { UserRole } from '@/entities/User'
import { ApiResponse } from '@/lib/apiResponse'
import { logger } from '@/lib/logger'

export const logsRouter = express.Router({ mergeParams: true })

const LOG_DIR = path.join(process.cwd(), 'logs')
const BASE_LOG_FILENAME = 'app.log'

// Helper function to find the latest log file
function getLatestLogFile(): string | null {
    if (!fs.existsSync(LOG_DIR)) return null

    try {
        const files = fs.readdirSync(LOG_DIR)

        // Filter for files starting with 'app' and containing '.log' (matches app.log, app.1.log, app-2023...log)
        const logFiles = files.filter(f => f.startsWith('app') && f.includes('.log'))

        if (logFiles.length === 0) return null

        // Sort by modification time (newest first)
        // Note: pino-roll typically names files with timestamps, but sorting by mtime is safer generally
        const sortedFiles = logFiles
            .map(file => ({
                name: file,
                mtime: fs.statSync(path.join(LOG_DIR, file)).mtime.getTime()
            }))
            .sort((a, b) => b.mtime - a.mtime)

        return path.join(LOG_DIR, sortedFiles[0].name)
    } catch (error) {
        logger.error({ error }, 'Error finding latest log file')
        return null
    }
}

// Helper function to read logs backwards
async function readLastLines(maxLines: number): Promise<any[]> {
    const filePath = getLatestLogFile()

    if (!filePath || !fs.existsSync(filePath)) {
        return []
    }

    const lines: any[] = []
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
            const logs = await readLastLines(limit)

            res.json(ApiResponse.success({ logs }))
        } catch (error) {
            logger.error({ error }, 'Error accessing logs')
            res.status(500).json(ApiResponse.serverError('Could not retrieve logs'))
        }
    }
)
