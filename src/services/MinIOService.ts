import { Client } from 'minio'
import path from 'path'
import sharp from 'sharp'
import fs from 'fs'
import { Readable } from 'stream'

interface UploadOptions {
  userId: string
  fullName: string
}

interface ProcessedImages {
  original: Buffer
  compressed: Buffer
  withWatermark: Buffer
}

class MinIOService {
  private internalMinioClient: Client
  private publicMinioClient: Client
  private readonly ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
  private readonly THUMBNAIL_SIZE = 200

  constructor() {
    const accessKey = process.env.MINIO_ACCESS_KEY || 'admin'
    const secretKey = process.env.MINIO_SECRET_KEY || 'admin123'
    const host = process.env.MINIO_HOST || 'localhost'
    const port = parseInt(process.env.MINIO_PORT || '9000', 10)
    const useSSL = process.env.MINIO_USE_SSL === 'true'

    // Cliente interno para API (uploads, deletes, etc.)
    this.internalMinioClient = new Client({
      endPoint: host,
      port: port,
      useSSL: useSSL,
      accessKey: accessKey,
      secretKey: secretKey,
    })

    // Cliente público para generar URLs presignadas
    const publicHost = process.env.MINIO_PUBLIC_HOST || host
    const publicPort = parseInt(process.env.MINIO_PUBLIC_PORT || String(port), 10)
    const publicUseSSL = process.env.MINIO_PUBLIC_USE_SSL === 'true' || useSSL

    this.publicMinioClient = new Client({
      endPoint: publicHost,
      port: publicPort,
      useSSL: publicUseSSL,
      accessKey: accessKey,
      secretKey: secretKey,
    })
  }

  /**
   * Validar tipo y tamaño de archivo
   */
  validateFile(fileBuffer: Buffer, mimetype: string): { valid: boolean; error?: string } {
    if (!this.ALLOWED_MIME_TYPES.includes(mimetype)) {
      return {
        valid: false,
        error: `Tipo de archivo no permitido. Solo se aceptan: ${this.ALLOWED_MIME_TYPES.join(', ')}`,
      }
    }

    if (fileBuffer.length > this.MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `Archivo demasiado grande. Máximo: ${this.MAX_FILE_SIZE / 1024 / 1024}MB`,
      }
    }

    return { valid: true }
  }

  /**
   * Comprimir imagen (solo JPG/PNG)
   */
  private async compressImage(buffer: Buffer, mimetype: string): Promise<Buffer> {
    if (mimetype === 'application/pdf') {
      return buffer
    }

    try {
      return await sharp(buffer, { failOnError: false })
        .rotate() // Auto-rotate based on EXIF
        .resize(2000, 2000, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80, progressive: true, mozjpeg: true }) // mozjpeg suele ser más tolerante
        .toBuffer()
    } catch (error) {
      console.warn('Warning: Could not compress image, using original file. Error:', error)
      return buffer
    }
  }

  /**
   * Agregar watermark/firma digital con timestamp, usuario y logo
   */
  private async addWatermark(buffer: Buffer, mimetype: string, options: UploadOptions): Promise<Buffer> {
    if (mimetype === 'application/pdf') {
      return buffer
    }

    try {
      const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const watermarkText = `Subido por: ${options.fullName}\n${timestamp}`

      // Crear SVG con texto
      const svgText = `
        <svg width="800" height="150">
          <rect width="800" height="150" fill="rgba(0,0,0,0.3)" />
          <text x="20" y="50" font-size="28" fill="white" font-family="Arial, sans-serif" font-weight="bold">
            COMPROBANTE DE PAGO
          </text>
          <text x="20" y="90" font-size="18" fill="white" font-family="Arial, sans-serif">
            ${watermarkText.split('\n')[0]}
          </text>
          <text x="20" y="120" font-size="18" fill="white" font-family="Arial, sans-serif">
            ${watermarkText.split('\n')[1]}
          </text>
        </svg>
      `

      const svgBuffer = Buffer.from(svgText)

      // Cargar el logo
      const logoPath = path.join(__dirname, '../../assets/LogoLosChamos.avif')
      const compositeArray: Array<{ input: Buffer | string; gravity: string; bottom?: number; right?: number }> = [
        {
          input: svgBuffer,
          gravity: 'northwest' as const,
        },
      ]

      // Agregar logo si existe
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath)
        const logoResized = await sharp(logoBuffer)
          .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
          .toBuffer()

        compositeArray.push({
          input: logoResized,
          gravity: 'southeast' as const,
          bottom: 30,
          right: 30,
        })
      }

      return await sharp(buffer).rotate().composite(compositeArray).jpeg({ quality: 80, progressive: true }).toBuffer()
    } catch (error) {
      console.error('Error adding watermark:', error)
      return buffer
    }
  }

  /**
   * Procesar imagen: comprimir y agregar watermark
   */
  async processImage(fileBuffer: Buffer, mimetype: string, _options: UploadOptions): Promise<ProcessedImages> {
    const compressed = await this.compressImage(fileBuffer, mimetype)
    // const withWatermark = await this.addWatermark(compressed, mimetype, options)

    return {
      original: fileBuffer,
      compressed,
      withWatermark: compressed,
    }
  }

  async ensureBucket(bucketName: string): Promise<void> {
    try {
      const exists = await this.internalMinioClient.bucketExists(bucketName)
      if (!exists) {
        await this.internalMinioClient.makeBucket(bucketName, 'us-east-1')
        console.log(`Bucket ${bucketName} created successfully`)
      }
    } catch (error) {
      console.error(`Error ensuring bucket ${bucketName}:`, error)
      throw error
    }
  }

  async uploadProcessedFile(
    bucketName: string,
    baseFilename: string,
    images: ProcessedImages,
    mimetype: string
  ): Promise<{ key: string }> {
    try {
      await this.ensureBucket(bucketName)

      const [nameWithoutExt, ext] = baseFilename.split(/\.(?=[^.]+$)/)

      // Subir comprimido con watermark
      const mainKey = `${nameWithoutExt}-main.${ext}`
      await this.internalMinioClient.putObject(bucketName, mainKey, images.withWatermark, images.withWatermark.length, {
        'Content-Type': mimetype,
      })

      console.log(`Uploaded payment proof: ${mainKey}`)

      return { key: mainKey }
    } catch (error) {
      console.error(`Error uploading processed file to MinIO:`, error)
      throw error
    }
  }

  async deleteFile(bucketName: string, filename: string): Promise<void> {
    try {
      await this.internalMinioClient.removeObject(bucketName, filename)
    } catch (error) {
      console.error(`Error deleting file from MinIO:`, error)
      throw error
    }
  }

  async getPresignedUrl(bucketName: string, filename: string, expiresIn: number = 3600): Promise<string> {
    try {
      const url = await this.publicMinioClient.presignedGetObject(bucketName, filename, expiresIn)
      return url
    } catch (error) {
      console.error(`Error generating presigned URL:`, error)
      throw error
    }
  }

  async getFileAsBuffer(bucketName: string, filename: string): Promise<Buffer> {
    try {
      const chunks: Buffer[] = []
      const stream: Readable = await this.internalMinioClient.getObject(bucketName, filename)

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })

        stream.on('end', () => {
          resolve(Buffer.concat(chunks))
        })

        stream.on('error', (err: Error) => {
          reject(err)
        })
      })
    } catch (error) {
      console.error(`Error retrieving file from MinIO:`, error)
      throw error
    }
  }
}

export const minioService = new MinIOService()
