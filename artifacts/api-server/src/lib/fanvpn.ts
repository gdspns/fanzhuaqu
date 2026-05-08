import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DEFAULT_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCUHMdMJFSzOnuO
OIRY3UZcWTXfCexZ15UOXjZB8fvgLxyvTN5gTh+Wo6SNb48ojuIw/p3fltMom3ZW
eyeKD5QB/sL+LgWHs10GrCE73TYwsmhdXUCyZhZX7VK8meqsFBBf7SDTPcJ6lfup
XsFstxQWV9nq2FQAQLSzUVU46KGjADKV7cEwamQ+C+0ix74EfDYvaZohfUtHEMie
MB5xYePJnxPS1qqP4Ftsgco5/hZfscsf9lR4+LSDAj+krNRo2j6Kto030Kxrwymi
7KbfVvlXujYsoh+LlhEXEAxHYUTbllKvcKRWvEiMNkW64+lFMclVIkHs0KjRPrOY
0nfy0iVJAgMBAAECggEAQdrP5HOM84nv0OshMW/lbn89/Dcpz0KTJGnQXx7seqAH
9YvMnm5uDikhq79sHED3oog7guRJbBc/lTE6AeFuUjrH0YN98vnVxXc4aakwhJN2
4vhpIUlR6vN7I5+eH7fmFfjV7QbbV20jkgmvIBsBA/Q40Pox01Dx538k0OJiqBnr
h+jdL99lURPYkG3/mfT3R2pG+vIP2PYydW0pi87f6AK4pxFZnAF82MuGcCM+Byr0
ga8/pSV4wmkU+kezK4P6RfbSi4tuUszvaBWcczAgqEN3yltYwN0v/JSk2oHcBSx4
phJV/RGGGg/IRHt4d0zi3PRfTrx2YI7AEgc1TCVSxwKBgQDMTdr6j64IMtWM45TG
QMcwtZLDutdCpvkVBGtpzdj3DWP2ZYAWQoO1ko1T2IOKkNWIXO3PEmX2fnTvyERk
XPQeiLf085TNnfnzKvCG8DrQwHZqdb2Wt1M2FJkYvxd14CALK2l6yHUEAyNveUoD
VcmtOapYvCndo9d7JpmoiCzelwKBgQC5lwKqyhwLEvbKegMMSZKrL5AsdKbp/r/r
Vovgw2wBhtmj7Gr8bnkS9nAmI3mETCFolxmbDHPK2Yt6D/+LtIcOdalI6Ox93nHx
IV2kPQff5czWa78IiiGPeJYrp/ZBZK33egWJWPAsQsZAms0GXAQ9vSomUUBi8rUT
Lkc03c13HwKBgQCsSqv0yd5WA6ib3ADHADH7HeTbM2H9T5qW4tdCrtnd3mkCja5r
F0TDhwewQdMMs/+fs97I1hcuvI4Y+KbUjJ9CcMHRzOkcTbFQJFIbOdQf3279cLWl
uIxv+wbxG5XJTm03fjDB3vLvo0Xq6DpGfb5KW2sQ0f3scBN0Q6Upv003mQKBgFPk
oG8Fx6F15BtpBiGyzFsXuAtwe9dAsg6246opjJQwGgfQohgT9CUPQ2jqFk8oft2h
mBCPk3Q53KPDwZesdnSh2XE84VKQkF8Y3xSUBhA+99ZhhExe7IbHUtLPLTEoSr+Y
6BHLI15OnQGtOErMo5oo/XmutvVDk3jlLYkHTo6vAoGBAKaT2qIDOStdCrwRbvD1
SF/pcEytM0rQhiJYmBXKeayUsICTxnSdixb42BSRDTL14F6Jzv2GcGRh80Jx1DVL
6Dmv27MEXx3OnCiHmTCHi3CxqKXhOvJGQCbtLLjluP6pAvQCZ7s3KB6/zS4v/fIv
zygLJrETnjWa1iAMPLnIB9lB
-----END PRIVATE KEY-----`;

const KEY_FILE = path.join(process.cwd(), 'private_key.pem');

function loadKey(): string {
  try {
    if (fs.existsSync(KEY_FILE)) {
      const saved = fs.readFileSync(KEY_FILE, 'utf8').trim();
      if (saved.startsWith('-----BEGIN')) {
        console.log('✅ 已从持久化文件加载自定义私钥');
        return saved;
      }
    }
  } catch { /* 读取失败则使用内置密钥 */ }
  return DEFAULT_PRIVATE_KEY;
}

let currentPrivateKey = loadKey();

const API_URLS = [
  'https://www.githubip.xyz/config.json',
  'https://gitlab.com/zhifan999/fq/-/raw/main/config.json'
];

export interface NodeInfo {
  name: string;
  server: string;
  port: number;
  flag?: string;
}

export interface Subscription {
  id: string;
  name: string;
  token: string;
  expireAt: number;
  createdAt: number;
}

interface Envelope {
  key: string;
  iv: string;
  data: string;
}

interface DecryptedConfig {
  nodes: NodeInfo[];
}

export const nodeData = {
  nodes: [] as NodeInfo[],
  lastUpdate: null as Date | null,
  status: '初始化中'
};

export const subscriptionStore = new Map<string, Subscription>();

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 8);
}

export function createSubscription(name: string, days: number): Subscription {
  const sub: Subscription = {
    id: generateId(),
    name,
    token: generateId(),
    expireAt: Date.now() + days * 24 * 60 * 60 * 1000,
    createdAt: Date.now()
  };
  subscriptionStore.set(sub.token, sub);
  return sub;
}

export function listSubscriptions(): Subscription[] {
  return Array.from(subscriptionStore.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function updateSubscriptionById(id: string, updates: { name?: string; expireAt?: number }): Subscription | null {
  for (const [token, sub] of subscriptionStore.entries()) {
    if (sub.id === id) {
      if (updates.name) sub.name = updates.name;
      if (updates.expireAt) sub.expireAt = updates.expireAt;
      subscriptionStore.set(token, sub);
      return sub;
    }
  }
  return null;
}

export function deleteSubscriptionById(id: string): boolean {
  for (const [token, sub] of subscriptionStore.entries()) {
    if (sub.id === id) {
      subscriptionStore.delete(token);
      return true;
    }
  }
  return false;
}

export function findSubscriptionByToken(token: string): Subscription | undefined {
  return subscriptionStore.get(token);
}

function decryptEnvelope(envelope: Envelope): DecryptedConfig {
  const encryptedAesKey = Buffer.from(envelope.key, 'base64');
  const aesKey = crypto.privateDecrypt(
    {
      key: currentPrivateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha1'
    },
    encryptedAesKey
  );

  const iv = Buffer.from(envelope.iv, 'base64');
  const encryptedData = Buffer.from(envelope.data, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  let decrypted = decipher.update(encryptedData, 'binary', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted) as DecryptedConfig;
}

export async function fetchAndUpdateNodes(): Promise<void> {
  console.log(`[${new Date().toLocaleString()}] 开始拉取最新节点...`);

  for (const url of API_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;

      const envelope = (await res.json()) as Envelope;
      const config = decryptEnvelope(envelope);

      if (config && config.nodes && config.nodes.length > 0) {
        nodeData.nodes = config.nodes;
        nodeData.lastUpdate = new Date();
        nodeData.status = '更新成功';
        console.log(`✅ 成功拉取并解密了 ${config.nodes.length} 个节点`);
        return;
      }
    } catch {
      console.warn(`⚠️ 源 ${url} 拉取失败，尝试下一个...`);
    }
  }

  nodeData.status = '更新失败，等待重试';
  console.error('❌ 所有节点源拉取失败！');
}

export function getPrivateKey(): string {
  return currentPrivateKey;
}

export function setPrivateKey(pem: string): void {
  currentPrivateKey = pem.trim();
  try {
    const dir = path.dirname(KEY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(KEY_FILE, currentPrivateKey, 'utf8');
    console.log('✅ 私钥已持久化保存到文件');
  } catch (e) {
    console.error('⚠️ 私钥持久化写入失败:', e);
  }
}

export function startNodeScheduler(): void {
  fetchAndUpdateNodes().catch(console.error);
  setInterval(() => {
    fetchAndUpdateNodes().catch(console.error);
  }, 2 * 60 * 60 * 1000);
}
