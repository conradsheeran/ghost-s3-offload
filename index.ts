import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
    GetObjectCommand,
    S3ClientConfig,
    GetObjectCommandOutput,
    ObjectCannedACL,
    ServerSideEncryption
} from '@aws-sdk/client-s3';
import BaseStore from 'ghost-storage-base';
import { join } from 'path';
import { promises as fs } from 'fs';
import { Request, Response, NextFunction } from 'express';
import { Readable } from 'stream';

// 定义传入构造函数的配置对象的接口
interface S3OffloadConfig {
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
    bucket: string;
    assetHost?: string;
    pathPrefix?: string;
    endpoint?: string;
    serverSideEncryption?: string;
    forcePathStyle?: boolean;
    acl?: string;
}

// 定义 Ghost 传入的 image 对象的接口
interface GhostImage {
    path: string;
    name: string;
    type: string;
}

const stripLeadingSlash = (s: string): string => (s.startsWith('/') ? s.substring(1) : s);
const stripEndingSlash = (s: string): string => (s.endsWith('/') ? s.substring(0, s.length - 1) : s);

class S3Offload extends BaseStore {
    private readonly region: string;
    private readonly bucket: string;
    private readonly host: string;
    private readonly pathPrefix: string;
    private readonly endpoint?: string;
    private readonly serverSideEncryption?: string;
    private readonly forcePathStyle: boolean;
    private readonly acl: string;
    private _s3: S3Client;

    constructor(config: S3OffloadConfig = { bucket: '' }) {
        super();

        const {
            accessKeyId,
            secretAccessKey,
            region,
            bucket,
            assetHost,
            pathPrefix,
            endpoint,
            serverSideEncryption,
            forcePathStyle,
            acl,
        } = config;

        this.region = process.env.AWS_DEFAULT_REGION || region || 'us-east-1';
        this.bucket = process.env.GHOST_STORAGE_ADAPTER_S3_PATH_BUCKET || bucket;
        if (!this.bucket) {
            throw new Error('S3 bucket is required.');
        }

        this.pathPrefix = stripLeadingSlash(process.env.GHOST_STORAGE_ADAPTER_S3_PATH_PREFIX || pathPrefix || '');
        this.endpoint = process.env.GHOST_STORAGE_ADAPTER_S3_ENDPOINT || endpoint;
        this.serverSideEncryption = process.env.GHOST_STORAGE_ADAPTER_S3_SSE || serverSideEncryption;
        this.forcePathStyle = Boolean(process.env.GHOST_STORAGE_ADAPTER_S3_FORCE_PATH_STYLE) || Boolean(forcePathStyle) || false;
        this.acl = process.env.GHOST_STORAGE_ADAPTER_S3_ACL || acl || 'public-read';

        const defaultHost = this.forcePathStyle && this.endpoint
            ? `${this.endpoint}/${this.bucket}`
            : `https://s3.${this.region}.amazonaws.com/${this.bucket}`;
        this.host = stripEndingSlash(process.env.GHOST_STORAGE_ADAPTER_S3_ASSET_HOST || assetHost || defaultHost);

        this._s3 = this.createS3Client(accessKeyId, secretAccessKey);
    }

    /**
     * 创建并返回一个配置好的 S3 客户端实例
     */
    private createS3Client(accessKeyId?: string, secretAccessKey?: string): S3Client {
        const options: S3ClientConfig = {
            region: this.region,
            forcePathStyle: this.forcePathStyle,
        };

        if (accessKeyId && secretAccessKey) {
            options.credentials = {
                accessKeyId: accessKeyId,
                secretAccessKey: secretAccessKey,
            };
        }

        if (this.endpoint) {
            options.endpoint = this.endpoint;
        }

        return new S3Client(options);
    }

    /**
     * 从 S3 删除一个文件
     */
    public async delete(fileName: string, targetDir?: string): Promise<boolean> {
        const directory = targetDir || this.getTargetDir(this.pathPrefix);
        const key = stripLeadingSlash(join(directory, fileName));
        const command = new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        try {
            await this._s3.send(command);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 检查文件是否存在于 S3
     */
    public async exists(fileName: string, targetDir?: string): Promise<boolean> {
        const key = stripLeadingSlash(join(targetDir || '', fileName));
        const command = new HeadObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        try {
            await this._s3.send(command);
            return true;
        } catch (error: any) {
            if (error.name === 'NotFound') {
                return false;
            }
            throw error;
        }
    }

    /**
     * 将图片保存到 S3
     * @param image Ghost 提供的图片对象
     * @param targetDir 目标目录
     * @returns 返回在 S3 上的完整可访问 URL
     */
    public async save(image: GhostImage, targetDir?: string): Promise<string> {
        const directory = targetDir || this.getTargetDir(this.pathPrefix);

        try {
            const fileName = await this.getUniqueFileName(image, directory);
            const fileBuffer = await fs.readFile(image.path);

            const command = new PutObjectCommand({
                ACL: this.acl as ObjectCannedACL,
                Body: fileBuffer,
                Bucket: this.bucket,
                CacheControl: `max-age=${30 * 24 * 60 * 60}`,
                ContentType: image.type,
                Key: stripLeadingSlash(fileName),
                ServerSideEncryption: this.serverSideEncryption as ServerSideEncryption
            });

            await this._s3.send(command);

            return `${this.host}/${stripLeadingSlash(fileName)}`;

        } catch (error) {
            throw error;
        }
    }

    /**
     * 实现一个 Express 中间件，用于直接从 S3 提供文件服务
     */
    public serve() {
        return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
            const key = stripLeadingSlash(stripEndingSlash(this.pathPrefix) + req.path);

            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });

            try {
                const s3Response: GetObjectCommandOutput = await this._s3.send(command);

                res.set({
                    'Content-Type': s3Response.ContentType,
                    'Content-Length': s3Response.ContentLength?.toString(),
                    'ETag': s3Response.ETag,
                    'Cache-Control': s3Response.CacheControl,
                    'Last-Modified': s3Response.LastModified?.toUTCString(),
                });

                if (s3Response.Body instanceof Readable) {
                    s3Response.Body.pipe(res);
                } else {
                    res.status(500).send('Error streaming file from S3.');
                }

            } catch (error: any) {
                if (error.name === 'NoSuchKey') {
                    res.status(404);
                }
                return next(error);
            }
        };
    }

    /**
     * 从 S3 读取文件的内容
     * @param options 包含文件路径等信息的对象
     * @returns 返回文件的 Buffer
     */
    public async read(options: { path?: string } = {}): Promise<Buffer> {
        let path = (options.path || '').replace(/\/$/, '');

        if (!path.startsWith(this.host)) {
            throw new Error(`${path} is not stored in s3`);
        }

        const key = stripLeadingSlash(path.substring(this.host.length));

        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        try {
            const data = await this._s3.send(command);

            if (data.Body) {
                const chunks: Uint8Array[] = [];
                for await (const chunk of data.Body as Readable) {
                    chunks.push(chunk);
                }
                return Buffer.concat(chunks);
            }
            throw new Error('S3 object body is empty.');
        } catch (error) {
            throw error;
        }
    }
}

export = S3Offload;
