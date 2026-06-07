// s3/s3.service.ts

import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'crypto';

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.client = new S3Client({
      region: process.env.AWS_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    });
    this.bucket = process.env.AWS_S3_BUCKET ?? '';
  }

  // ---------------------------------------------------------------------------
  // Upload a PDF buffer. Returns the S3 key.
  // Key pattern: leaves/{leaveId}/{timestamp}-{random}.pdf
  // ---------------------------------------------------------------------------
  async uploadLeavePdf(
    leaveId: number,
    buffer: Buffer,
    originalName: string,
  ): Promise<string> {
    if (!buffer.length) {
      throw new InternalServerErrorException('File buffer is empty');
    }

    const ext = originalName.split('.').pop()?.toLowerCase();
    if (ext !== 'pdf') {
      throw new InternalServerErrorException('Only PDF files are accepted');
    }

    const key = `leaves/${leaveId}/${Date.now()}-${randomBytes(8).toString('hex')}.pdf`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: 'application/pdf',
          // private by default — access via presigned URL only
          ACL: 'private',
          Metadata: {
            leaveId: String(leaveId),
            originalName,
          },
        }),
      );
      return key;
    } catch (err) {
      throw new InternalServerErrorException(
        `S3 upload failed: ${(err as Error).message}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Generate a presigned GET URL valid for 15 minutes.
  // ---------------------------------------------------------------------------
  async getPresignedUrl(key: string, expiresInSeconds = 900): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: expiresInSeconds },
      );
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to generate presigned URL: ${(err as Error).message}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Delete an object by key. Silent if key does not exist.
  // ---------------------------------------------------------------------------
  async deleteFile(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      throw new InternalServerErrorException(
        `S3 delete failed: ${(err as Error).message}`,
      );
    }
  }
}
