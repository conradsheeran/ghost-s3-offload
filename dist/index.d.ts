/// <reference types="node" />
/// <reference types="node" />
import BaseStore from 'ghost-storage-base';
import { Request, Response, NextFunction } from 'express';
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
interface GhostImage {
    path: string;
    name: string;
    type: string;
}
declare class S3Offload extends BaseStore {
    private readonly region;
    private readonly bucket;
    private readonly host;
    private readonly pathPrefix;
    private readonly endpoint?;
    private readonly serverSideEncryption?;
    private readonly forcePathStyle;
    private readonly acl;
    private _s3;
    constructor(config?: S3OffloadConfig);
    /**
     * 创建并返回一个配置好的 S3 客户端实例
     */
    private createS3Client;
    /**
     * 从 S3 删除一个文件
     */
    delete(fileName: string, targetDir?: string): Promise<boolean>;
    /**
     * 检查文件是否存在于 S3
     */
    exists(fileName: string, targetDir?: string): Promise<boolean>;
    /**
     * 将图片保存到 S3
     * @param image Ghost 提供的图片对象
     * @param targetDir 目标目录
     * @returns 返回在 S3 上的完整可访问 URL
     */
    save(image: GhostImage, targetDir?: string): Promise<string>;
    /**
     * 实现一个 Express 中间件，用于直接从 S3 提供文件服务
     */
    serve(): (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * 从 S3 读取文件的内容
     * @param options 包含文件路径等信息的对象
     * @returns 返回文件的 Buffer
     */
    read(options?: {
        path?: string;
    }): Promise<Buffer>;
}
export = S3Offload;
