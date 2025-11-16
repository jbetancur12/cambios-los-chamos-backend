import { Client } from 'minio'
import path from 'path'

class MinIOService {
  private minioClient: Client

  constructor() {
    const accessKey = process.env.MINIO_ACCESS_KEY || 'admin'
    const secretKey = process.env.MINIO_SECRET_KEY || 'admin123'
    const host = process.env.MINIO_HOST || 'localhost'
    const port = parseInt(process.env.MINIO_PORT || '9000', 10)
    const useSSL = process.env.MINIO_USE_SSL === 'true'

    this.minioClient = new Client({
      endPoint: host,
      port: port,
      useSSL: useSSL,
      accessKey: accessKey,
      secretKey: secretKey,
    })
  }

  async ensureBucket(bucketName: string): Promise<void> {
    try {
      const exists = await this.minioClient.bucketExists(bucketName)
      if (!exists) {
        await this.minioClient.makeBucket(bucketName, 'us-east-1')
        console.log(`Bucket ${bucketName} created successfully`)
      }
    } catch (error) {
      console.error(`Error ensuring bucket ${bucketName}:`, error)
      throw error
    }
  }

  async uploadFile(bucketName: string, filename: string, fileBuffer: Buffer, mimetype: string): Promise<string> {
    try {
      await this.ensureBucket(bucketName)

      await this.minioClient.putObject(bucketName, filename, fileBuffer, fileBuffer.length, {
        'Content-Type': mimetype,
      })

      return filename
    } catch (error) {
      console.error(`Error uploading file to MinIO:`, error)
      throw error
    }
  }

  async deleteFile(bucketName: string, filename: string): Promise<void> {
    try {
      await this.minioClient.removeObject(bucketName, filename)
    } catch (error) {
      console.error(`Error deleting file from MinIO:`, error)
      throw error
    }
  }

  async getPresignedUrl(bucketName: string, filename: string, expiresIn: number = 3600): Promise<string> {
    try {
      const url = await this.minioClient.presignedGetObject(bucketName, filename, expiresIn)
      return url
    } catch (error) {
      console.error(`Error generating presigned URL:`, error)
      throw error
    }
  }

  async getFileAsBuffer(bucketName: string, filename: string): Promise<Buffer> {
    try {
      const chunks: Buffer[] = []
      const stream: any = await this.minioClient.getObject(bucketName, filename)

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })

        stream.on('end', () => {
          resolve(Buffer.concat(chunks))
        })

        stream.on('error', (err: any) => {
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
