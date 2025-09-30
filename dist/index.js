"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const client_s3_1 = require("@aws-sdk/client-s3");
const ghost_storage_base_1 = __importDefault(require("ghost-storage-base"));
const path_1 = require("path");
const fs_1 = require("fs");
const stream_1 = require("stream");
const stripLeadingSlash = (s) => (s.startsWith('/') ? s.substring(1) : s);
const stripEndingSlash = (s) => (s.endsWith('/') ? s.substring(0, s.length - 1) : s);
class S3Offload extends ghost_storage_base_1.default {
    constructor(config = { bucket: '' }) {
        super();
        const { accessKeyId, secretAccessKey, region, bucket, assetHost, pathPrefix, endpoint, serverSideEncryption, forcePathStyle, acl, } = config;
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
    createS3Client(accessKeyId, secretAccessKey) {
        const options = {
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
        return new client_s3_1.S3Client(options);
    }
    /**
     * 从 S3 删除一个文件
     */
    async delete(fileName, targetDir) {
        const directory = targetDir || this.getTargetDir(this.pathPrefix);
        const key = stripLeadingSlash((0, path_1.join)(directory, fileName));
        const command = new client_s3_1.DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        try {
            await this._s3.send(command);
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * 检查文件是否存在于 S3
     */
    async exists(fileName, targetDir) {
        const key = stripLeadingSlash((0, path_1.join)(targetDir || '', fileName));
        const command = new client_s3_1.HeadObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        try {
            await this._s3.send(command);
            return true;
        }
        catch (error) {
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
    async save(image, targetDir) {
        const directory = targetDir || this.getTargetDir(this.pathPrefix);
        try {
            const fileName = await this.getUniqueFileName(image, directory);
            const fileBuffer = await fs_1.promises.readFile(image.path);
            const command = new client_s3_1.PutObjectCommand({
                ACL: this.acl,
                Body: fileBuffer,
                Bucket: this.bucket,
                CacheControl: `max-age=${30 * 24 * 60 * 60}`,
                ContentType: image.type,
                Key: stripLeadingSlash(fileName),
                ServerSideEncryption: this.serverSideEncryption
            });
            await this._s3.send(command);
            return `${this.host}/${stripLeadingSlash(fileName)}`;
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * 实现一个 Express 中间件，用于直接从 S3 提供文件服务
     */
    serve() {
        return async (req, res, next) => {
            const key = stripLeadingSlash(stripEndingSlash(this.pathPrefix) + req.path);
            const command = new client_s3_1.GetObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });
            try {
                const s3Response = await this._s3.send(command);
                res.set({
                    'Content-Type': s3Response.ContentType,
                    'Content-Length': s3Response.ContentLength?.toString(),
                    'ETag': s3Response.ETag,
                    'Cache-Control': s3Response.CacheControl,
                    'Last-Modified': s3Response.LastModified?.toUTCString(),
                });
                if (s3Response.Body instanceof stream_1.Readable) {
                    s3Response.Body.pipe(res);
                }
                else {
                    res.status(500).send('Error streaming file from S3.');
                }
            }
            catch (error) {
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
    async read(options = {}) {
        let path = (options.path || '').replace(/\/$/, '');
        if (!path.startsWith(this.host)) {
            throw new Error(`${path} is not stored in s3`);
        }
        const key = stripLeadingSlash(path.substring(this.host.length));
        const command = new client_s3_1.GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        try {
            const data = await this._s3.send(command);
            if (data.Body) {
                const chunks = [];
                for await (const chunk of data.Body) {
                    chunks.push(chunk);
                }
                return Buffer.concat(chunks);
            }
            throw new Error('S3 object body is empty.');
        }
        catch (error) {
            throw error;
        }
    }
}
module.exports = S3Offload;
//# sourceMappingURL=index.js.map