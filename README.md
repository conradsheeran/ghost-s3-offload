# Ghost S3 Offload Storage Adapter

这是一个为 [Ghost](https://ghost.org/) 设计的存储适配器，它允许您将媒体文件无缝地上传到 AWS S3 或任何 S3 兼容的对象存储服务（如 MinIO, Cloudflare R2, DigitalOcean Spaces 等）

该适配器基于 AWS SDK v3 (`@aws-sdk/client-s3`) 构建

## 特性

-   将媒体文件上传到 S3 或 S3 兼容的服务
-   通过环境变量或 Ghost 配置文件进行灵活配置
-   支持自定义域名/CDN (`assetHost`)
-   支持在存储桶中使用路径前缀 (`pathPrefix`)
-   支持服务器端加密 (`serverSideEncryption`)
-   支持路径样式访问 (`forcePathStyle`)，增强了与 S3 兼容服务的兼容性

## 安装

1.  **进入 Ghost 内容目录**
    打开终端，导航到您的 Ghost 安装目录下的 `content` 文件夹。

    ```bash
    cd /path/to/your/ghost/content
    ```

2.  **创建 `adapters/storage` 目录**
    如果目录不存在，请创建它

    ```bash
    mkdir -p adapters/storage
    ```

3.  **下载适配器**
    将此存储库克隆或下载到 `storage` 目录中。

    ```bash
    cd adapters/storage
    git clone https://github.com/conradsheeran/ghost-s3-offload.git
    ```

4.  **安装依赖**
    进入适配器目录并安装所需的 npm 包。

    ```bash
    cd ghost-s3-offload
    npm install
    ```

## 配置

在 Ghost 的根目录下打开您的配置文件（例如 `config.production.json`），并在 `storage` 块中添加以下配置。

```json
{
  "storage": {
    "active": "ghost-s3-offload",
    "ghost-s3-offload": {
      "accessKeyId": "YOUR_ACCESS_KEY",
      "secretAccessKey": "YOUR_SECRET_KEY",
      "region": "us-east-1",
      "bucket": "your-bucket-name",
      "assetHost": "https://your-cdn-or-custom-domain.com",
      "pathPrefix": "media",
      "endpoint": "https://s3.example.com",
      "forcePathStyle": true
    }
  }
}
```

### 配置选项

| 键 | 环境变量 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `accessKeyId` | `AWS_ACCESS_KEY_ID` | 您的 S3 访问密钥 ID。如果使用 IAM 角色，则可以省略。 | - |
| `secretAccessKey` | `AWS_SECRET_ACCESS_KEY` | 您的 S3 秘密访问密钥。如果使用 IAM 角色，则可以省略。 | - |
| `region` | `AWS_DEFAULT_REGION` | 您的 S3 存储桶所在的区域。 | `us-east-1` |
| `bucket` | `GHOST_STORAGE_ADAPTER_S3_PATH_BUCKET` | **必需项**。您的 S3 存储桶名称。 | - |
| `assetHost` | `GHOST_STORAGE_ADAPTER_S3_ASSET_HOST` | （可选）用于访问文件的自定义域名或 CDN 地址。 | S3 默认 URL |
| `pathPrefix` | `GHOST_STORAGE_ADAPTER_S3_PATH_PREFIX` | （可选）在存储桶中存放文件的路径前缀。 | - |
| `endpoint` | `GHOST_STORAGE_ADAPTER_S3_ENDPOINT` | （可选）用于 S3 兼容服务的端点 URL。 | - |
| `serverSideEncryption` | `GHOST_STORAGE_ADAPTER_S3_SSE` | （可选）服务器端加密算法，如 `AES256` 或 `aws:kms`。 | - |
| `forcePathStyle` | `GHOST_STORAGE_ADAPTER_S3_FORCE_PATH_STYLE` | （可选）设置为 `true` 以使用路径样式的 URL (`endpoint/bucket`)。 | `false` |
| `acl` | `GHOST_STORAGE_ADAPTER_S3_ACL` | （可选）上传对象的访问控制列表 (ACL)。 | `public-read` |

**注意**: 除示例环境变量以外，其它环境变量暂未进行测试，已有媒体文件不会被主动上传，后续考虑开发这个功能

## 重启 Ghost

完成配置后，请重启您的 Ghost 实例以使更改生效。

```bash
ghost restart
```
