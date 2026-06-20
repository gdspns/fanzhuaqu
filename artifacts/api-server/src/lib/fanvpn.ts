import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db, subscriptions, subscriptionDevices, settings } from '@workspace/db';
import { eq, and, count } from 'drizzle-orm';

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

function loadKeyFromFile(): string {
  try {
    if (fs.existsSync(KEY_FILE)) {
      const saved = fs.readFileSync(KEY_FILE, 'utf8').trim();
      if (saved.startsWith('-----BEGIN')) return saved;
    }
  } catch { /* fall through */ }
  return DEFAULT_PRIVATE_KEY;
}

let currentPrivateKey = loadKeyFromFile();

const API_URLS = [
  'https://www.githubip.xyz/config.json',
  'https://gitlab.com/zhifan999/fq/-/raw/main/config.json'
];

export interface NodeInfo {
  name: string;
  server: string;
  port: number;
  flag?: string;
  // 协议类型和完整配置
  type?: 'http' | 'ss' | 'vless' | 'vmess' | 'trojan' | 'hysteria2' | 'hy2';
  // Shadowsocks
  password?: string;
  cipher?: string;
  // VLESS/VMess
  uuid?: string;
  alterId?: number;
  encryption?: string;
  flow?: string;
  // 传输层
  network?: string;
  security?: string;
  sni?: string;
  alpn?: string | string[];
  fp?: string;
  // Reality
  pbk?: string;
  sid?: string;
  // 其他传输配置
  path?: string;
  host?: string;
  mode?: string;
  // Hysteria2
  obfs?: string;
  'obfs-password'?: string;
  ports?: string;
  // 通用
  skipCertVerify?: boolean;
  [key: string]: any;
}

export interface Subscription {
  id: string;
  name: string;
  token: string;
  expireAt: number;
  createdAt: number;
  maxDevices: number;
}

export interface DeviceInfo {
  ip: string;
  firstSeen: number;
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
  status: '初始化中',
  changedNodeNames: new Set<string>(),
};

export const subscriptionStore = new Map<string, Subscription>();

// ===== 自定义节点 =====
let customNodes: NodeInfo[] = [];

export function listCustomNodes(): NodeInfo[] { return [...customNodes]; }

export function addCustomNode(node: NodeInfo): { ok: boolean; error?: string } {
  if (customNodes.find(n => n.name === node.name)) return { ok: false, error: '节点名称已存在' };
  customNodes.push(node);
  dbUpsertSetting('customNodes', JSON.stringify(customNodes)).catch(console.error);
  return { ok: true };
}

export function updateCustomNode(oldName: string, newName: string): { ok: boolean; error?: string } {
  const idx = customNodes.findIndex(n => n.name === oldName);
  if (idx === -1) return { ok: false, error: '节点不存在' };
  if (oldName !== newName && customNodes.find(n => n.name === newName)) {
    return { ok: false, error: '节点名称已存在' };
  }
  customNodes[idx].name = newName;
  dbUpsertSetting('customNodes', JSON.stringify(customNodes)).catch(console.error);
  return { ok: true };
}

export function deleteCustomNode(name: string): boolean {
  const idx = customNodes.findIndex(n => n.name === name);
  if (idx === -1) return false;
  customNodes.splice(idx, 1);
  dbUpsertSetting('customNodes', JSON.stringify(customNodes)).catch(console.error);
  return true;
}

// ===== 代理链接解析 =====
interface ParsedProxyNode {
  name: string;
  server: string;
  port: number;
  protocol: string;
  [key: string]: any;
}

function safeBase64Decode(str: string): string {
  try {
    let normalized = str.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4) normalized += '=';
    return Buffer.from(normalized, 'base64').toString('utf-8');
  } catch {
    throw new Error('Base64解码失败');
  }
}

function extractRemark(hash: string): string {
  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}

function parseShadowsocks(url: string): ParsedProxyNode {
  const match = url.match(/^ss:\/\/([^#@]+)(?:@([^#]+))?(?:#(.+))?$/);
  if (!match) throw new Error('无效的SS链接格式');
  
  const remark = match[3] ? extractRemark(match[3]) : '';
  
  try {
    if (match[2]) {
      // 新格式: ss://base64@server:port#remark
      const decoded = safeBase64Decode(match[1]);
      const [method, password] = decoded.split(':');
      const [server, port] = match[2].split(':');
      return { name: remark || `SS-${server}`, server, port: parseInt(port) || 443, protocol: 'ss', method, password };
    } else {
      // 旧格式: ss://base64(method:password@server:port)#remark
      const decoded = safeBase64Decode(match[1]);
      const m = decoded.match(/^(.+?):(.+?)@(.+?):(\d+)$/);
      if (!m) throw new Error('无法解析SS配置');
      return { name: remark || `SS-${m[3]}`, server: m[3], port: parseInt(m[4]), protocol: 'ss', method: m[1], password: m[2] };
    }
  } catch (e) {
    throw new Error('SS链接解析失败: ' + (e instanceof Error ? e.message : String(e)));
  }
}

function parseVless(url: string): ParsedProxyNode {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    const remark = urlObj.hash ? extractRemark(urlObj.hash.slice(1)) : '';
    
    const node: ParsedProxyNode = {
      name: remark || `VLESS-${urlObj.hostname}`,
      server: urlObj.hostname,
      port: parseInt(urlObj.port) || 443,
      protocol: 'vless',
      uuid: urlObj.username,
      encryption: params.get('encryption') || 'none',
      flow: params.get('flow') || '',
      security: params.get('security') || 'none',
      sni: params.get('sni') || '',
      fp: params.get('fp') || '',
      alpn: params.get('alpn') || '',
      pbk: params.get('pbk') || '',
      sid: params.get('sid') || '',
      network: params.get('type') || 'tcp',
      mode: params.get('mode') || '',
      path: params.get('path') || '',
      host: params.get('host') || '',
    };
    
    // 清理空值
    Object.keys(node).forEach(key => {
      if (node[key] === '') delete node[key];
    });
    
    return node;
  } catch {
    throw new Error('VLESS链接格式错误');
  }
}

function parseVmess(url: string): ParsedProxyNode {
  try {
    const base64Part = url.replace(/^vmess:\/\//, '');
    const decoded = safeBase64Decode(base64Part);
    const config = JSON.parse(decoded);
    
    const node: ParsedProxyNode = {
      name: config.ps || config.name || `VMess-${config.add || config.address}`,
      server: config.add || config.address,
      port: parseInt(config.port) || 443,
      protocol: 'vmess',
      uuid: config.id,
      alterId: parseInt(config.aid) || 0,
      cipher: config.scy || 'auto',
      network: config.net || config.type || 'tcp',
      security: config.tls || config.security || '',
      sni: config.sni || config.host || '',
      host: config.host || '',
      path: config.path || '',
    };
    
    // 清理空值
    Object.keys(node).forEach(key => {
      if (node[key] === '') delete node[key];
    });
    
    return node;
  } catch (e) {
    throw new Error('VMess链接解析失败: ' + (e instanceof Error ? e.message : String(e)));
  }
}

function parseTrojan(url: string): ParsedProxyNode {
  try {
    const urlObj = new URL(url);
    const remark = urlObj.hash ? extractRemark(urlObj.hash.slice(1)) : '';
    return {
      name: remark || `Trojan-${urlObj.hostname}`,
      server: urlObj.hostname,
      port: parseInt(urlObj.port) || 443,
      protocol: 'trojan',
      password: urlObj.username,
    };
  } catch {
    throw new Error('Trojan链接格式错误');
  }
}

function parseAnyTLS(url: string): ParsedProxyNode {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    const remark = urlObj.hash ? extractRemark(urlObj.hash.slice(1)) : '';
    
    const node: ParsedProxyNode = {
      name: remark || `AnyTLS-${urlObj.hostname}`,
      server: urlObj.hostname,
      port: parseInt(urlObj.port) || 443,
      protocol: 'anytls',
      uuid: urlObj.username,
      security: params.get('security') || 'tls',
      sni: params.get('sni') || '',
      network: params.get('type') || 'tcp',
      skipCertVerify: params.get('insecure') === '1' || params.get('allowInsecure') === '1',
    };
    
    // 清理空值
    Object.keys(node).forEach(key => {
      if (node[key] === '') delete node[key];
    });
    
    return node;
  } catch {
    throw new Error('AnyTLS链接格式错误');
  }
}

function parseHysteria2(url: string): ParsedProxyNode {
  try {
    const urlObj = new URL(url.replace(/^hy2:\/\//, 'hysteria2://'));
    const remark = urlObj.hash ? extractRemark(urlObj.hash.slice(1)) : '';
    return {
      name: remark || `Hysteria2-${urlObj.hostname}`,
      server: urlObj.hostname,
      port: parseInt(urlObj.port) || 443,
      protocol: 'hysteria2',
      password: urlObj.username,
    };
  } catch {
    throw new Error('Hysteria2链接格式错误');
  }
}

export function parseProxyLink(link: string): ParsedProxyNode {
  const trimmed = link.trim();
  if (!trimmed) throw new Error('链接为空');
  
  if (trimmed.startsWith('ss://')) return parseShadowsocks(trimmed);
  if (trimmed.startsWith('vless://')) return parseVless(trimmed);
  if (trimmed.startsWith('vmess://')) return parseVmess(trimmed);
  if (trimmed.startsWith('trojan://')) return parseTrojan(trimmed);
  if (trimmed.startsWith('anytls://')) return parseAnyTLS(trimmed);
  if (trimmed.startsWith('hysteria2://') || trimmed.startsWith('hy2://')) return parseHysteria2(trimmed);
  
  throw new Error(`不支持的协议: ${trimmed.split('://')[0] || '未知'}`);
}

export function importProxyLinks(links: string[]): { success: number; failed: number; errors: string[]; duplicates: string[] } {
  let success = 0;
  let failed = 0;
  const errors: string[] = [];
  const duplicates: string[] = [];
  
  for (const link of links) {
    const trimmed = link.trim();
    if (!trimmed) continue;
    
    try {
      const parsed = parseProxyLink(trimmed);
      
      // 转换为NodeInfo格式，保留完整的协议配置
      const node: NodeInfo = {
        name: parsed.name,
        server: parsed.server,
        port: parsed.port,
        flag: undefined,
      };
      
      // 根据协议类型，保存完整配置
      if (parsed.protocol === 'ss') {
        node.type = 'ss';
        node.password = parsed.password;
        node.cipher = parsed.method;
      } else if (parsed.protocol === 'vless') {
        node.type = 'vless';
        node.uuid = parsed.uuid;
        node.encryption = parsed.encryption;
        node.flow = parsed.flow;
        node.network = parsed.network;
        node.security = parsed.security;
        node.sni = parsed.sni;
        node.fp = parsed.fp;
        node.alpn = parsed.alpn;
        node.pbk = parsed.pbk;
        node.sid = parsed.sid;
        node.mode = parsed.mode;
        node.path = parsed.path;
        node.host = parsed.host;
      } else if (parsed.protocol === 'vmess') {
        node.type = 'vmess';
        node.uuid = parsed.uuid;
        node.alterId = parsed.alterId;
        node.cipher = parsed.cipher;
        node.network = parsed.network;
        node.security = parsed.security;
        node.sni = parsed.sni;
        node.host = parsed.host;
        node.path = parsed.path;
      } else if (parsed.protocol === 'trojan') {
        node.type = 'trojan';
        node.password = parsed.password;
        node.sni = parsed.sni;
        node.network = parsed.network;
        node.security = parsed.security;
      } else if (parsed.protocol === 'hysteria2') {
        node.type = 'hysteria2';
        node.password = parsed.password;
        node.sni = parsed.sni;
        node.obfs = parsed.obfs;
        node['obfs-password'] = parsed['obfs-password'];
        node.ports = parsed.ports;
      } else if (parsed.protocol === 'anytls') {
        // AnyTLS 在 Clash 中作为 Trojan 处理
        node.type = 'trojan';
        node.password = parsed.uuid;  // AnyTLS 使用 UUID
        node.sni = parsed.sni;
        node.network = parsed.network || 'tcp';
        node.security = parsed.security || 'tls';
        node.skipCertVerify = parsed.skipCertVerify;
      }
      
      const result = addCustomNode(node);
      if (result.ok) {
        success++;
      } else {
        duplicates.push(parsed.name);
      }
    } catch (e) {
      failed++;
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push(`${trimmed.substring(0, 30)}... - ${errorMsg}`);
    }
  }
  
  return { success, failed, errors, duplicates };
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 8);
}

async function dbUpsertSetting(key: string, value: string): Promise<void> {
  if (!db) return;
  try {
    await db.insert(settings).values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });
  } catch (e) {
    console.error('⚠️ DB 设置写入失败:', e);
  }
}

async function dbUpsertSubscription(sub: Subscription): Promise<void> {
  if (!db) return;
  try {
    await db.insert(subscriptions).values({
      id: sub.id,
      name: sub.name,
      token: sub.token,
      expireAt: sub.expireAt,
      createdAt: sub.createdAt,
      maxDevices: sub.maxDevices,
    }).onConflictDoUpdate({
      target: subscriptions.id,
      set: { name: sub.name, token: sub.token, expireAt: sub.expireAt, maxDevices: sub.maxDevices }
    });
  } catch (e) {
    console.error('⚠️ DB 订阅写入失败:', e);
  }
}

async function dbDeleteSubscription(id: string): Promise<void> {
  if (!db) return;
  try {
    await db.delete(subscriptions).where(eq(subscriptions.id, id));
    const sub = Array.from(subscriptionStore.values()).find(s => s.id === id);
    if (sub) await db.delete(subscriptionDevices).where(eq(subscriptionDevices.token, sub.token));
  } catch (e) {
    console.error('⚠️ DB 订阅删除失败:', e);
  }
}

export async function saveSetting(key: string, value: string): Promise<void> {
  await dbUpsertSetting(key, value);
}

export async function initFromDB(): Promise<{ adminPassword?: string; siteTitle?: string; maxDevicesGlobal?: number }> {
  if (!db) {
    console.log('ℹ️ 未配置 DATABASE_URL，使用本地文件存储');
    return {};
  }
  try {
    const [allSubs, allSettings] = await Promise.all([
      db.select().from(subscriptions),
      db.select().from(settings),
    ]);

    for (const sub of allSubs) {
      subscriptionStore.set(sub.token, {
        id: sub.id,
        name: sub.name,
        token: sub.token,
        expireAt: sub.expireAt,
        createdAt: sub.createdAt,
        maxDevices: sub.maxDevices,
      });
    }
    console.log(`✅ 从数据库加载了 ${allSubs.length} 条订阅`);

    const settingsMap: Record<string, string> = {};
    for (const s of allSettings) settingsMap[s.key] = s.value;

    if (settingsMap['privateKey']) {
      currentPrivateKey = settingsMap['privateKey'];
      console.log('✅ 从数据库加载了自定义私钥');
    }

    if (settingsMap['customNodes']) {
      try {
        customNodes = JSON.parse(settingsMap['customNodes']) as NodeInfo[];
        console.log(`✅ 从数据库加载了 ${customNodes.length} 个自定义节点`);
      } catch { customNodes = []; }
    }

    return {
      adminPassword: settingsMap['adminPassword'],
      siteTitle: settingsMap['siteTitle'],
      maxDevicesGlobal: settingsMap['maxDevicesGlobal'] ? Number(settingsMap['maxDevicesGlobal']) : undefined,
    };
  } catch (e) {
    console.error('⚠️ 从数据库加载数据失败，回退到本地文件:', e);
    return {};
  }
}

export function createSubscription(name: string, days: number, maxDevices = 0): Subscription {
  const sub: Subscription = {
    id: generateId(),
    name,
    token: generateId(),
    expireAt: Date.now() + days * 24 * 60 * 60 * 1000,
    createdAt: Date.now(),
    maxDevices,
  };
  subscriptionStore.set(sub.token, sub);
  dbUpsertSubscription(sub).catch(console.error);
  return sub;
}

export function listSubscriptions(): Subscription[] {
  return Array.from(subscriptionStore.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function updateSubscriptionById(id: string, updates: { name?: string; expireAt?: number; maxDevices?: number }): Subscription | null {
  for (const [token, sub] of subscriptionStore.entries()) {
    if (sub.id === id) {
      if (updates.name !== undefined) sub.name = updates.name;
      if (updates.expireAt !== undefined) sub.expireAt = updates.expireAt;
      if (updates.maxDevices !== undefined) sub.maxDevices = updates.maxDevices;
      subscriptionStore.set(token, sub);
      dbUpsertSubscription(sub).catch(console.error);
      return sub;
    }
  }
  return null;
}

export function deleteSubscriptionById(id: string): boolean {
  for (const [token, sub] of subscriptionStore.entries()) {
    if (sub.id === id) {
      subscriptionStore.delete(token);
      dbDeleteSubscription(id).catch(console.error);
      return true;
    }
  }
  return false;
}

export function findSubscriptionByToken(token: string): Subscription | undefined {
  return subscriptionStore.get(token);
}

export async function getDeviceCount(token: string): Promise<number> {
  if (!db) return 0;
  try {
    const result = await db.select({ cnt: count() }).from(subscriptionDevices)
      .where(eq(subscriptionDevices.token, token));
    return result[0]?.cnt ?? 0;
  } catch { return 0; }
}

export async function getDeviceCountBatch(tokens: string[]): Promise<Record<string, number>> {
  if (!db || tokens.length === 0) return {};
  try {
    const rows = await db.select({ token: subscriptionDevices.token, cnt: count() })
      .from(subscriptionDevices)
      .groupBy(subscriptionDevices.token);
    const map: Record<string, number> = {};
    for (const r of rows) map[r.token] = r.cnt;
    return map;
  } catch { return {}; }
}

export async function listDevices(token: string): Promise<DeviceInfo[]> {
  if (!db) return [];
  try {
    const rows = await db.select({ ip: subscriptionDevices.ip, firstSeen: subscriptionDevices.firstSeen })
      .from(subscriptionDevices).where(eq(subscriptionDevices.token, token));
    return rows;
  } catch { return []; }
}

export async function clearDevices(token: string): Promise<void> {
  if (!db) return;
  try {
    await db.delete(subscriptionDevices).where(eq(subscriptionDevices.token, token));
  } catch (e) {
    console.error('⚠️ 清除设备失败:', e);
  }
}

export async function checkAndRegisterDevice(
  token: string, ip: string, maxDevices: number
): Promise<{ allowed: boolean; count: number }> {
  if (!db || maxDevices === 0) return { allowed: true, count: 0 };
  try {
    const existing = await db.select({ ip: subscriptionDevices.ip })
      .from(subscriptionDevices)
      .where(and(eq(subscriptionDevices.token, token), eq(subscriptionDevices.ip, ip)));
    if (existing.length > 0) return { allowed: true, count: -1 };

    const cnt = await getDeviceCount(token);
    if (cnt >= maxDevices) return { allowed: false, count: cnt };

    await db.insert(subscriptionDevices)
      .values({ token, ip, firstSeen: Date.now() })
      .onConflictDoNothing();
    return { allowed: true, count: cnt + 1 };
  } catch {
    return { allowed: true, count: 0 };
  }
}

function decryptEnvelope(envelope: Envelope): DecryptedConfig {
  const encryptedAesKey = Buffer.from(envelope.key, 'base64');
  const aesKey = crypto.privateDecrypt(
    { key: currentPrivateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' },
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
        const oldMap = new Map(nodeData.nodes.map(n => [n.name, `${n.server}:${n.port}`]));
        const changed = new Set<string>();
        if (nodeData.nodes.length > 0) {
          for (const node of config.nodes) {
            const oldKey = oldMap.get(node.name);
            if (!oldKey || oldKey !== `${node.server}:${node.port}`) {
              changed.add(node.name);
            }
          }
        }
        nodeData.nodes = config.nodes;
        changed.forEach(n => nodeData.changedNodeNames.add(n));
        nodeData.lastUpdate = new Date();
        nodeData.status = '更新成功';
        const changedCount = changed.size;
        console.log(`✅ 成功拉取并解密了 ${config.nodes.length} 个节点${changedCount > 0 ? `，其中 ${changedCount} 个节点链接有变化` : ''}`);
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
  dbUpsertSetting('privateKey', currentPrivateKey).catch(console.error);
}

export function startNodeScheduler(): void {
  fetchAndUpdateNodes().catch(console.error);
  setInterval(() => {
    fetchAndUpdateNodes().catch(console.error);
  }, 2 * 60 * 60 * 1000);
}
