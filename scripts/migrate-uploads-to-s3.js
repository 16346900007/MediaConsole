/* 迁移磁盘旧文件到 MinIO（保持原文件名作为 key，DB fileKey 不变，读取时由 resolveBucket 归一） */
const fs = require('fs');
const path = require('path');
const Minio = require('minio');

const uploadsRoot = process.env.APPDATA + '\\SocialManager\\uploads';
// MinIO 连接信息从环境变量读取，勿在代码里落明文（曾提交过密钥，已轮换）
const minioCfg = {
  endPoint: process.env.MINIO_ENDPOINT || '<内网IP>',
  port: Number(process.env.MINIO_PORT || 19000),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '<accessKey>',
  secretKey: process.env.MINIO_SECRET_KEY || '<secretKey>',
};
if (!process.env.MINIO_ACCESS_KEY || !process.env.MINIO_SECRET_KEY) {
  console.warn('[migrate] 未设置 MINIO_ACCESS_KEY / MINIO_SECRET_KEY，将使用占位值（仅提示，不会成功连接）。');
}
const client = new Minio.Client(minioCfg);

const BUCKET_MAP = {
  'publish-tmp': 'media-console-publish-tmp',
  'materials': 'media-console-materials',
};

async function main() {
  let moved = 0, skipped = 0, failed = 0;
  for (const short of Object.keys(BUCKET_MAP)) {
    const dir = path.join(uploadsRoot, short);
    const target = BUCKET_MAP[short];
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => !f.startsWith('__'));
    for (const f of files) {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      if (!st.isFile()) continue;
      try {
        await client.putObject(target, f, fs.createReadStream(p), st.size);
        moved++;
        console.log('MIGRATED', short, f);
      } catch (e) {
        // 已存在/失败均记录
        if (String(e.message).includes('already exists') || String(e.code) === 'XMinioObjectAlreadyExists') {
          skipped++;
        } else {
          failed++;
          console.log('FAIL', short, f, e.message);
        }
      }
    }
  }
  console.log(`DONE moved=${moved} skipped=${skipped} failed=${failed}`);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
