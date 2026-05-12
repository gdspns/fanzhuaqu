import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { nodeData, createSubscription, listSubscriptions, deleteSubscriptionById, updateSubscriptionById, findSubscriptionByToken, getPrivateKey, setPrivateKey, initFromDB, saveSetting, checkAndRegisterDevice, getDeviceCountBatch, listDevices, clearDevices } from '../lib/fanvpn.js';

const router = Router();

const PWD_FILE = path.join(process.cwd(), 'admin_password.txt');
const TITLE_FILE = path.join(process.cwd(), 'site_title.txt');
const DEFAULT_TITLE = 'Q3075554556';

function loadAdminPassword(): string {
  try {
    if (fs.existsSync(PWD_FILE)) {
      const saved = fs.readFileSync(PWD_FILE, 'utf8').trim();
      if (saved.length >= 4) return saved;
    }
  } catch { /* 读取失败则使用默认密码 */ }
  return 'admin';
}

function saveAdminPassword(pwd: string): void {
  try {
    fs.writeFileSync(PWD_FILE, pwd, 'utf8');
  } catch (e) {
    console.error('⚠️ 管理员密码文件写入失败:', e);
  }
  saveSetting('adminPassword', pwd).catch(console.error);
}

function loadSiteTitle(): string {
  try {
    if (fs.existsSync(TITLE_FILE)) {
      const saved = fs.readFileSync(TITLE_FILE, 'utf8').trim();
      if (saved.length > 0) return saved;
    }
  } catch { }
  return DEFAULT_TITLE;
}

function persistSiteTitle(title: string): void {
  try {
    fs.writeFileSync(TITLE_FILE, title, 'utf8');
  } catch (e) {
    console.error('⚠️ 标题文件写入失败:', e);
  }
  saveSetting('siteTitle', title).catch(console.error);
}

let adminPassword = loadAdminPassword();
let siteTitle = loadSiteTitle();
let maxDevicesGlobal = 0;

initFromDB().then(({ adminPassword: dbPwd, siteTitle: dbTitle, maxDevicesGlobal: dbMaxDev }) => {
  if (dbPwd) adminPassword = dbPwd;
  if (dbTitle) siteTitle = dbTitle;
  if (dbMaxDev !== undefined) maxDevicesGlobal = dbMaxDev;
}).catch(console.error);

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Q3075554556</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    (function() {
      document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      });

      document.addEventListener('keydown', function(e) {
        var key = e.key ? e.key.toLowerCase() : '';
        var code = e.keyCode || e.which;

        if (code === 123) { e.preventDefault(); e.stopPropagation(); return false; }

        if (e.ctrlKey || e.metaKey) {
          if (key === 'u') { e.preventDefault(); e.stopPropagation(); return false; }
          if ((e.shiftKey || e.altKey) && (key === 'i' || key === 'I')) { e.preventDefault(); e.stopPropagation(); return false; }
          if ((e.shiftKey || e.altKey) && (key === 'c' || key === 'C')) { e.preventDefault(); e.stopPropagation(); return false; }
          if ((e.shiftKey || e.altKey) && (key === 'j' || key === 'J')) { e.preventDefault(); e.stopPropagation(); return false; }
          if (e.altKey && (key === 'u' || key === 'U')) { e.preventDefault(); e.stopPropagation(); return false; }
        }
      });
    })();
  </script>
  <style>
    body { background-color: #050810; color: #E8F1FF; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .bg-card { background-color: #0F1525; border: 1px solid rgba(120, 200, 255, 0.1); }
    .bg-elevated { background-color: #131B2E; border: 1px solid rgba(120, 200, 255, 0.15); }
    .neon-text { color: #00E5FF; text-shadow: 0 0 10px rgba(0, 229, 255, 0.4); }
    .neon-border { border-color: rgba(0, 229, 255, 0.3); }
    .grid-bg {
      background-image: linear-gradient(rgba(120, 200, 255, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(120, 200, 255, 0.04) 1px, transparent 1px);
      background-size: 40px 40px;
    }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #1F2937; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #374151; }
  </style>
</head>
<body class="grid-bg min-h-screen text-sm md:text-base">

  <!-- 登录界面 -->
  <div id="login-view" class="flex items-center justify-center min-h-screen px-4">
    <div class="bg-card p-8 rounded-2xl shadow-[0_0_40px_rgba(0,229,255,0.1)] w-full max-w-sm border neon-border text-center">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-400 text-gray-900 font-bold text-3xl shadow-[0_0_20px_rgba(0,229,255,0.4)] mb-6">F</div>
      <h2 class="text-2xl font-bold mb-2">控制台</h2>
      <p class="text-gray-400 text-sm mb-6">请输入管理员密码访问</p>
      <div class="space-y-4 text-left">
        <input type="password" id="admin-pwd" placeholder="管理员密码" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-cyan-400 focus:outline-none focus:border-cyan-500 transition-colors" onkeypress="handleLoginEnter(event)">
        <p id="login-error" class="text-rose-400 text-xs hidden">密码错误，请重试</p>
        <button onclick="login()" class="w-full bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold py-3 rounded-lg transition-colors shadow-lg shadow-cyan-500/30">安全登录</button>
      </div>
    </div>
  </div>

  <!-- 管理后台 -->
  <div id="dashboard-view" class="hidden max-w-5xl mx-auto p-4 md:p-8 space-y-6">

    <!-- 顶栏 -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-400 to-emerald-400 text-gray-900 font-bold text-xl flex items-center justify-center">F</div>
        <div>
          <h1 id="site-title-text" class="text-lg font-bold tracking-tight">专属节点分发中心</h1>
          <p class="text-gray-400 text-xs" id="status-text">系统状态: 正常</p>
        </div>
      </div>
      <div class="flex gap-1 bg-gray-900 p-1 rounded-lg border border-gray-800 flex-wrap">
        <button onclick="switchTab('nodes')" id="tab-nodes" class="px-3 py-2 rounded-md font-semibold text-sm bg-gray-800 text-cyan-400 shadow transition-colors">节点概览</button>
        <button onclick="switchTab('subs')" id="tab-subs" class="px-3 py-2 rounded-md font-semibold text-sm text-gray-400 hover:text-white transition-colors">订阅管理</button>
        <button onclick="switchTab('keys')" id="tab-keys" class="px-3 py-2 rounded-md font-semibold text-sm text-gray-400 hover:text-white transition-colors">密钥管理</button>
        <button onclick="switchTab('pwd')" id="tab-pwd" class="px-3 py-2 rounded-md font-semibold text-sm text-gray-400 hover:text-white transition-colors">修改密码</button>
      </div>
      <button onclick="logout()" class="text-sm text-gray-500 hover:text-rose-400 transition-colors px-2">退出登录</button>
    </div>

    <!-- 节点概览 Tab -->
    <div id="view-nodes" class="space-y-4 block">
      <div class="flex justify-between items-end mb-2">
        <h2 class="text-xl font-semibold">📡 当前可用节点 (<span id="node-count">0</span>) <span id="changed-badge" class="hidden text-sm font-normal px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 ml-1">有更新</span></h2>
        <div class="flex items-center gap-3">
          <button id="clear-changes-btn" onclick="clearChanges()" class="hidden text-xs px-3 py-1.5 rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 transition-colors">✓ 标记已读</button>
          <span class="text-xs text-gray-500">每2小时自动从源码更新</span>
        </div>
      </div>
      <div id="nodes-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
    </div>

    <!-- 订阅管理 Tab -->
    <div id="view-subs" class="space-y-4 hidden">
      <div class="flex justify-between items-center bg-card p-6 rounded-2xl">
        <div>
          <h2 class="text-xl font-semibold">👥 独立订阅链接管理</h2>
          <p class="text-sm text-gray-400 mt-1">为不同设备或用户创建专属订阅，有效期到期后自动失效。</p>
        </div>
        <button onclick="openModal()" class="bg-emerald-500 hover:bg-emerald-400 text-gray-900 font-bold px-5 py-2.5 rounded-lg shadow-lg shadow-emerald-500/20 transition-transform active:scale-95 flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
          新增订阅
        </button>
      </div>
      <div class="bg-card rounded-2xl overflow-hidden border border-gray-800">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-gray-900/50 text-gray-400 text-xs uppercase tracking-wider border-b border-gray-800">
                <th class="p-4 font-medium">名称/备注</th>
                <th class="p-4 font-medium">Token标识</th>
                <th class="p-4 font-medium">到期时间</th>
                <th class="p-4 font-medium">状态</th>
                <th class="p-4 font-medium">设备</th>
                <th class="p-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody id="subs-list" class="divide-y divide-gray-800/50"></tbody>
          </table>
        </div>
        <div id="empty-state" class="hidden p-8 text-center text-gray-500">暂无订阅链接，请点击右上角新增。</div>
      </div>
    </div>

    <!-- 密钥管理 Tab -->
    <div id="view-keys" class="space-y-4 hidden">
      <div class="bg-card p-6 rounded-2xl">
        <h2 class="text-xl font-semibold mb-1">🔑 解密私钥管理</h2>
        <p class="text-sm text-gray-400 mb-4">修改用于解密远端节点数据的 RSA 私钥（PEM 格式）。修改后立即生效，但服务器重启后将恢复为代码内置密钥。</p>
        <label class="block text-sm text-gray-400 mb-2">当前 RSA 私钥</label>
        <textarea id="key-textarea" rows="13" spellcheck="false" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-cyan-400 text-xs font-mono focus:outline-none focus:border-cyan-500 resize-none"></textarea>
        <div class="flex gap-3 mt-4">
          <button onclick="loadKey()" class="px-4 py-2 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 transition-colors text-sm">重新加载</button>
          <button onclick="saveKey()" class="px-6 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold transition-colors text-sm">保存密钥</button>
        </div>
        <p class="text-xs text-emerald-400/70 mt-3">✅ 保存后将持久化到磁盘文件，服务器重启后自动加载，无需修改代码。</p>
      </div>
    </div>

    <!-- 修改管理员密码 Tab -->
    <div id="view-pwd" class="space-y-4 hidden">
      <div class="bg-card p-6 rounded-2xl max-w-md">
        <h2 class="text-xl font-semibold mb-1">📱 全局设备数量上限</h2>
        <p class="text-sm text-gray-400 mb-4">设置每个订阅链接最多允许的设备数。0 表示不限制。单个订阅设置的设备数不能超过此全局上限。</p>
        <div class="flex items-center gap-3">
          <input type="number" id="global-max-devices" min="0" max="100" placeholder="0 = 不限制" class="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-cyan-400 focus:outline-none focus:border-cyan-500">
          <button onclick="saveGlobalMaxDevices()" class="px-5 py-2 rounded-lg bg-violet-500 hover:bg-violet-400 text-white font-bold transition-colors">保存</button>
        </div>
        <p class="text-xs text-emerald-400/70 mt-3">✅ 超过设备数的订阅用户无法更新节点，有效防止转卖。</p>
      </div>
      <div class="bg-card p-6 rounded-2xl max-w-md">
        <h2 class="text-xl font-semibold mb-1">✏️ 修改页面标题</h2>
        <p class="text-sm text-gray-400 mb-4">修改后台页面显示的标题名称，保存后持久化，重启服务器也不丢失。</p>
        <div>
          <label class="block text-sm text-gray-400 mb-1">标题文字</label>
          <input type="text" id="site-title-input" placeholder="输入新标题..." class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-cyan-400 focus:outline-none focus:border-cyan-500">
        </div>
        <button onclick="saveSiteTitle()" class="w-full py-2.5 rounded-lg bg-violet-500 hover:bg-violet-400 text-white font-bold transition-colors mt-3">保存标题</button>
        <p class="text-xs text-emerald-400/70 mt-3">✅ 标题保存后持久化到磁盘，重启服务器后自动加载。</p>
      </div>
      <div class="bg-card p-6 rounded-2xl max-w-md">
        <h2 class="text-xl font-semibold mb-1">🔒 修改管理员密码</h2>
        <p class="text-sm text-gray-400 mb-4">修改后台登录密码。修改后持久化保存，服务器重启后自动加载。</p>
        <div class="space-y-3">
          <div>
            <label class="block text-sm text-gray-400 mb-1">当前密码</label>
            <input type="password" id="old-pwd" placeholder="输入当前密码" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-cyan-400 focus:outline-none focus:border-cyan-500">
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">新密码</label>
            <input type="password" id="new-pwd" placeholder="输入新密码（至少4位）" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-cyan-400 focus:outline-none focus:border-cyan-500">
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">确认新密码</label>
            <input type="password" id="confirm-pwd" placeholder="再次输入新密码" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-cyan-400 focus:outline-none focus:border-cyan-500">
          </div>
          <button onclick="changePassword()" class="w-full py-2.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-bold transition-colors mt-1">修改密码</button>
        </div>
        <p class="text-xs text-emerald-400/70 mt-4">✅ 密码保存后持久化到磁盘，重启服务器后自动加载，不会丢失。</p>
      </div>
    </div>
  </div>

  <!-- 新增订阅弹窗 -->
  <div id="add-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center hidden opacity-0 transition-opacity">
    <div class="bg-card p-6 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-md transform scale-95 transition-transform" id="add-modal-box">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-lg font-bold text-white">新增订阅配置</h3>
        <button onclick="closeModal()" class="text-gray-500 hover:text-white">&times;</button>
      </div>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-gray-400 mb-1">备注名称 (如: 朋友的iPhone)</label>
          <input type="text" id="sub-name" placeholder="输入识别名称..." class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-cyan-400 focus:outline-none focus:border-cyan-500">
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-1">到期时间</label>
          <input type="datetime-local" id="sub-expire-date" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-cyan-400 focus:outline-none focus:border-cyan-500 [color-scheme:dark]">
          <div class="flex gap-2 mt-2">
            <button onclick="setQuickDate(7)" class="quick-btn flex-1 border border-gray-700 bg-gray-900 rounded-lg py-1.5 text-xs hover:border-cyan-500 hover:text-cyan-400 transition-colors">+7天</button>
            <button onclick="setQuickDate(30)" class="quick-btn flex-1 border border-gray-700 bg-gray-900 rounded-lg py-1.5 text-xs hover:border-cyan-500 hover:text-cyan-400 transition-colors">+30天</button>
            <button onclick="setQuickDate(90)" class="quick-btn flex-1 border border-gray-700 bg-gray-900 rounded-lg py-1.5 text-xs hover:border-cyan-500 hover:text-cyan-400 transition-colors">+90天</button>
            <button onclick="setQuickDate(365)" class="quick-btn flex-1 border border-gray-700 bg-gray-900 rounded-lg py-1.5 text-xs hover:border-cyan-500 hover:text-cyan-400 transition-colors">+1年</button>
          </div>
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-1">设备数量限制 <span class="text-gray-600 text-xs">(0 = 不限制)</span></label>
          <input type="number" id="sub-max-devices" min="0" max="100" value="0" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-cyan-400 focus:outline-none focus:border-cyan-500">
          <p id="sub-max-devices-hint" class="text-xs text-gray-600 mt-1"></p>
        </div>
        <div class="pt-4 flex gap-3">
          <button onclick="closeModal()" class="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 transition-colors">取消</button>
          <button onclick="createSub()" class="flex-1 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-gray-900 font-bold transition-colors">立即生成</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 编辑订阅弹窗 -->
  <div id="edit-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center hidden opacity-0 transition-opacity">
    <div class="bg-card p-6 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-md transform scale-95 transition-transform" id="edit-modal-box">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-lg font-bold text-white">编辑订阅</h3>
        <button onclick="closeEditModal()" class="text-gray-500 hover:text-white text-xl">&times;</button>
      </div>
      <input type="hidden" id="edit-sub-id">
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-gray-400 mb-1">备注名称</label>
          <input type="text" id="edit-sub-name" placeholder="输入备注名称..." class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-cyan-400 focus:outline-none focus:border-cyan-500">
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-1">到期时间</label>
          <input type="datetime-local" id="edit-expire-date" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-cyan-400 focus:outline-none focus:border-cyan-500 [color-scheme:dark]">
          <div class="flex gap-2 mt-2">
            <button onclick="setEditQuickDate(7)" class="flex-1 border border-gray-700 bg-gray-900 rounded-lg py-1.5 text-xs hover:border-cyan-500 hover:text-cyan-400 transition-colors">+7天</button>
            <button onclick="setEditQuickDate(30)" class="flex-1 border border-gray-700 bg-gray-900 rounded-lg py-1.5 text-xs hover:border-cyan-500 hover:text-cyan-400 transition-colors">+30天</button>
            <button onclick="setEditQuickDate(90)" class="flex-1 border border-gray-700 bg-gray-900 rounded-lg py-1.5 text-xs hover:border-cyan-500 hover:text-cyan-400 transition-colors">+90天</button>
            <button onclick="setEditQuickDate(365)" class="flex-1 border border-gray-700 bg-gray-900 rounded-lg py-1.5 text-xs hover:border-cyan-500 hover:text-cyan-400 transition-colors">+1年</button>
          </div>
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-1">设备数量限制 <span class="text-gray-600 text-xs">(0 = 不限制)</span></label>
          <input type="number" id="edit-max-devices" min="0" max="100" value="0" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-cyan-400 focus:outline-none focus:border-cyan-500">
        </div>
        <div class="pt-2 flex gap-3">
          <button onclick="closeEditModal()" class="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 transition-colors">取消</button>
          <button onclick="saveEdit()" class="flex-1 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold transition-colors">保存修改</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 设备列表弹窗 -->
  <div id="devices-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center hidden opacity-0 transition-opacity">
    <div class="bg-card p-6 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-md transform scale-95 transition-transform" id="devices-modal-box">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold text-white">📱 已注册设备</h3>
        <button onclick="closeDevicesModal()" class="text-gray-500 hover:text-white text-xl">&times;</button>
      </div>
      <p class="text-xs text-gray-500 mb-3">以下 IP 地址已接入该订阅。清除后设备需重新注册。</p>
      <div id="devices-list" class="space-y-2 max-h-64 overflow-y-auto mb-4"></div>
      <div class="flex gap-3">
        <button onclick="closeDevicesModal()" class="flex-1 py-2 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 transition-colors text-sm">关闭</button>
        <button onclick="doClearDevices()" class="flex-1 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-bold transition-colors text-sm">清除所有设备</button>
      </div>
    </div>
  </div>
  <input type="hidden" id="devices-current-token">
  <input type="hidden" id="devices-current-id">

  <!-- 通知 -->
  <div id="toast" class="fixed top-5 left-1/2 -translate-x-1/2 bg-emerald-500 text-gray-900 px-6 py-3 rounded-full font-bold shadow-lg transform -translate-y-20 opacity-0 transition-all z-[100]">操作成功！</div>

  <script>
    function handleLoginEnter(e) { if (e.key === 'Enter') login(); }

    let sessionPwd = sessionStorage.getItem('fanvpn_pwd') || '';

    function showDashboard() {
      document.getElementById('login-view').classList.add('hidden');
      document.getElementById('dashboard-view').classList.remove('hidden');
      initDashboard();
    }

    function login() {
      const pwd = document.getElementById('admin-pwd').value;
      fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      }).then(r => {
        if (r.ok) {
          sessionPwd = pwd;
          sessionStorage.setItem('fanvpn_pwd', pwd);
          showDashboard();
        } else {
          const err = document.getElementById('login-error');
          err.classList.remove('hidden');
          setTimeout(() => err.classList.add('hidden'), 3000);
        }
      }).catch(() => {
        const err = document.getElementById('login-error');
        err.classList.remove('hidden');
        setTimeout(() => err.classList.add('hidden'), 3000);
      });
    }

    function clearChanges() {
      fetch('/api/clear-changes', { method: 'POST', headers: { 'x-admin-password': sessionPwd } })
        .then(() => initDashboard());
    }

    function logout() {
      sessionPwd = '';
      sessionStorage.removeItem('fanvpn_pwd');
      document.getElementById('admin-pwd').value = '';
      document.getElementById('dashboard-view').classList.add('hidden');
      document.getElementById('login-view').classList.remove('hidden');
    }

    if (sessionPwd) {
      fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: sessionPwd })
      }).then(r => {
        if (r.ok) {
          showDashboard();
        } else {
          sessionPwd = '';
          sessionStorage.removeItem('fanvpn_pwd');
        }
      }).catch(() => {});
    }

    function initDashboard() {
      fetch('/api/status')
        .then(r => r.json())
        .then(data => {
          document.getElementById('node-count').innerText = data.count;
          const date = data.lastUpdate ? new Date(data.lastUpdate).toLocaleString() : '获取中...';
          document.getElementById('status-text').innerHTML =
            \`系统状态: <span class="\${data.status.includes('成功') ? 'text-emerald-400' : 'text-rose-400'}">\${data.status}</span> | 最后更新: \${date}\`;
          const grid = document.getElementById('nodes-grid');
          grid.innerHTML = '';
          if (data.nodes.length === 0) {
            grid.innerHTML = '<div class="col-span-full p-8 text-center text-gray-500">后端暂未抓取到节点，请稍候刷新...</div>';
          }
          const changedSet = new Set(data.changedNodeNames || []);
          const hasChanges = changedSet.size > 0;
          document.getElementById('changed-badge').classList.toggle('hidden', !hasChanges);
          document.getElementById('clear-changes-btn').classList.toggle('hidden', !hasChanges);
          data.nodes.forEach(node => {
            const isChanged = changedSet.has(node.name);
            grid.innerHTML += \`
              <div class="bg-elevated p-4 rounded-xl transition-colors cursor-default \${isChanged ? 'border border-rose-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]' : 'hover:border-cyan-500'}">
                <div class="flex items-center gap-3 mb-3">
                  <div class="w-8 h-8 rounded bg-gray-800 flex items-center justify-center font-bold text-xs border \${isChanged ? 'border-rose-500' : 'neon-border'}">\${node.flag || '🌐'}</div>
                  <div class="font-semibold text-sm truncate flex-1">\${node.name}</div>
                  \${isChanged ? '<span class="text-xs px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 whitespace-nowrap">已更新</span>' : ''}
                </div>
                <div class="text-xs text-gray-500 font-mono space-y-1">
                  <div class="flex justify-between"><span>协议:</span> <span class="text-gray-300">HTTPS Proxy</span></div>
                  <div class="flex justify-between"><span>端口:</span> <span class="text-gray-300">\${node.port}</span></div>
                  <div class="flex justify-between border-t border-gray-800 mt-2 pt-2 truncate"><span class="\${isChanged ? 'text-rose-400' : 'text-cyan-600'}">\${node.server}</span></div>
                </div>
              </div>\`;
          });
        })
        .catch(() => {
          document.getElementById('status-text').innerHTML = \`系统状态: <span class="text-rose-400">后端连接异常</span>\`;
        });
      renderSubs();
      loadSiteTitle();
    }

    function switchTab(tab) {
      const tabs = ['nodes', 'subs', 'keys', 'pwd'];
      const active = 'px-3 py-2 rounded-md font-semibold text-sm bg-gray-800 text-cyan-400 shadow transition-colors';
      const inactive = 'px-3 py-2 rounded-md font-semibold text-sm text-gray-400 hover:text-white transition-colors';
      tabs.forEach(t => {
        document.getElementById('tab-' + t).className = t === tab ? active : inactive;
        document.getElementById('view-' + t).classList.toggle('hidden', t !== tab);
      });
      if (tab === 'nodes') initDashboard();
      else if (tab === 'subs') renderSubs();
      else if (tab === 'keys') loadKey();
      else if (tab === 'pwd') loadGlobalMaxDevices();
    }

    // ===== 订阅管理（全部走服务端 API）=====
    function renderSubs() {
      fetch('/api/subs')
        .then(r => r.json())
        .then(subs => {
          const list = document.getElementById('subs-list');
          const emptyState = document.getElementById('empty-state');
          list.innerHTML = '';
          if (subs.length === 0) { emptyState.classList.remove('hidden'); return; }
          emptyState.classList.add('hidden');
          subs.forEach(sub => {
            const isExpired = Date.now() > sub.expireAt;
            const expireDate = new Date(sub.expireAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            const statusBadge = isExpired
              ? '<span class="px-2 py-1 rounded bg-rose-500/10 text-rose-400 text-xs border border-rose-500/20">已过期</span>'
              : '<span class="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 text-xs border border-emerald-500/20">正常</span>';
            const maxDev = sub.maxDevices > 0 ? sub.maxDevices : '∞';
            const devCount = sub.deviceCount || 0;
            const devOver = sub.maxDevices > 0 && devCount >= sub.maxDevices;
            const deviceBadge = devOver
              ? \`<span class="px-2 py-1 rounded bg-rose-500/10 text-rose-400 text-xs border border-rose-500/20">\${devCount}/\${maxDev}</span>\`
              : \`<span class="px-2 py-1 rounded bg-gray-700/50 text-gray-400 text-xs">\${devCount}/\${maxDev}</span>\`;
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-800/30 transition-colors';
            row.innerHTML = \`
              <td class="p-4 text-white font-medium">\${sub.name}</td>
              <td class="p-4 font-mono text-cyan-600/80 text-xs select-all">\${sub.token}</td>
              <td class="p-4 text-gray-400 text-xs">\${expireDate}</td>
              <td class="p-4">\${statusBadge}</td>
              <td class="p-4">\${deviceBadge}</td>
              <td class="p-4 text-right space-x-2">
                <button onclick="copySubUrl('\${sub.token}', 'clash')" class="text-xs bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 px-3 py-1.5 rounded transition-colors \${isExpired ? 'opacity-50 cursor-not-allowed' : ''}" \${isExpired ? 'disabled' : ''}>复制 Clash</button>
                <button onclick="viewDevices('\${sub.id}', '\${sub.token}')" class="text-xs bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 px-3 py-1.5 rounded transition-colors">设备</button>
                <button onclick="openEditModal('\${sub.id}', '\${sub.name.replace(/'/g, '&#39;')}', \${sub.expireAt}, \${sub.maxDevices})" class="text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 px-3 py-1.5 rounded transition-colors">编辑</button>
                <button onclick="deleteSub('\${sub.id}')" class="text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-3 py-1.5 rounded transition-colors">删除</button>
              </td>\`;
            list.appendChild(row);
          });
        });
    }

    function closeModal() {
      document.getElementById('add-modal').classList.add('opacity-0');
      document.getElementById('add-modal-box').classList.add('scale-95');
      setTimeout(() => document.getElementById('add-modal').classList.add('hidden'), 300);
    }

    function setQuickDate(days) {
      const d = new Date();
      d.setDate(d.getDate() + days);
      d.setHours(23, 59, 59, 0);
      document.getElementById('sub-expire-date').value = d.toISOString().slice(0, 16);
    }

    function openModal() {
      document.getElementById('sub-name').value = '';
      document.getElementById('sub-max-devices').value = '0';
      setQuickDate(30);
      document.getElementById('add-modal').classList.remove('hidden');
      setTimeout(() => {
        document.getElementById('add-modal').classList.remove('opacity-0');
        document.getElementById('add-modal-box').classList.remove('scale-95');
      }, 10);
    }

    function createSub() {
      const name = document.getElementById('sub-name').value.trim();
      const dateVal = document.getElementById('sub-expire-date').value;
      const maxDevices = parseInt(document.getElementById('sub-max-devices').value) || 0;
      if (!name) { showToast('请输入备注名称', true); return; }
      if (!dateVal) { showToast('请选择到期时间', true); return; }
      const expireAt = new Date(dateVal).getTime();
      if (expireAt <= Date.now()) { showToast('到期时间必须是未来的时间', true); return; }
      fetch('/api/subs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, expireAt, maxDevices })
      })
        .then(r => r.json())
        .then(() => {
          renderSubs();
          closeModal();
          showToast('🎉 订阅链接创建成功！');
        })
        .catch(() => showToast('创建失败，请重试', true));
    }

    function deleteSub(id) {
      if (!confirm('确定要彻底删除该订阅吗？删除后对应用户的链接将立即失效。')) return;
      fetch('/api/subs/' + id, { method: 'DELETE' })
        .then(() => { renderSubs(); showToast('🗑️ 已删除该订阅'); })
        .catch(() => showToast('删除失败', true));
    }

    function copySubUrl(token, type) {
      const url = window.location.origin + '/api/sub/' + type + '/' + token;
      navigator.clipboard.writeText(url).then(() => {
        showToast('复制成功！可直接粘贴至 Clash');
      }).catch(() => {
        const tmp = document.createElement('input');
        tmp.value = url; document.body.appendChild(tmp); tmp.select();
        document.execCommand('copy'); document.body.removeChild(tmp);
        showToast('复制成功！可直接粘贴至 Clash');
      });
    }

    function showToast(msg, isError = false) {
      const toast = document.getElementById('toast');
      toast.innerText = msg;
      toast.className = \`fixed top-5 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full font-bold shadow-lg transform transition-all z-[100] \${isError ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-gray-900'}\`;
      toast.classList.remove('-translate-y-20', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
      setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('-translate-y-20', 'opacity-0');
      }, 3000);
    }

    // ===== 标题管理 =====
    function loadSiteTitle() {
      fetch('/api/admin/title')
        .then(r => r.json())
        .then(d => {
          document.getElementById('site-title-text').textContent = d.title;
          document.getElementById('site-title-input').value = d.title;
          document.title = d.title + ' - 管理后台';
        })
        .catch(() => {});
    }

    function saveSiteTitle() {
      const title = document.getElementById('site-title-input').value.trim();
      if (!title) { showToast('标题不能为空', true); return; }
      fetch('/api/admin/title', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': sessionPwd },
        body: JSON.stringify({ title })
      }).then(r => r.json()).then(d => {
        if (d.ok) {
          document.getElementById('site-title-text').textContent = title;
          document.title = title + ' - 管理后台';
          showToast('✏️ 标题已更新！');
        } else {
          showToast(d.error || '保存失败', true);
        }
      }).catch(() => showToast('保存失败', true));
    }

    // ===== 编辑订阅 =====
    function openEditModal(id, name, expireAt, maxDevices) {
      document.getElementById('edit-sub-id').value = id;
      document.getElementById('edit-sub-name').value = name;
      document.getElementById('edit-max-devices').value = maxDevices || 0;
      const d = new Date(expireAt);
      document.getElementById('edit-expire-date').value = d.toISOString().slice(0, 16);
      document.getElementById('edit-modal').classList.remove('hidden');
      setTimeout(() => {
        document.getElementById('edit-modal').classList.remove('opacity-0');
        document.getElementById('edit-modal-box').classList.remove('scale-95');
      }, 10);
    }

    function closeEditModal() {
      document.getElementById('edit-modal').classList.add('opacity-0');
      document.getElementById('edit-modal-box').classList.add('scale-95');
      setTimeout(() => document.getElementById('edit-modal').classList.add('hidden'), 300);
    }

    function setEditQuickDate(days) {
      const d = new Date();
      d.setDate(d.getDate() + days);
      d.setHours(23, 59, 59, 0);
      document.getElementById('edit-expire-date').value = d.toISOString().slice(0, 16);
    }

    function saveEdit() {
      const id = document.getElementById('edit-sub-id').value;
      const name = document.getElementById('edit-sub-name').value.trim();
      const dateVal = document.getElementById('edit-expire-date').value;
      const maxDevices = parseInt(document.getElementById('edit-max-devices').value) || 0;
      if (!name) { showToast('备注名称不能为空', true); return; }
      if (!dateVal) { showToast('请选择到期时间', true); return; }
      const expireAt = new Date(dateVal).getTime();
      fetch('/api/subs/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, expireAt, maxDevices })
      }).then(r => r.json()).then(d => {
        if (d.id || d.ok) {
          renderSubs();
          closeEditModal();
          showToast('✅ 订阅已更新！');
        } else {
          showToast(d.error || '更新失败', true);
        }
      }).catch(() => showToast('更新失败', true));
    }

    // ===== 密钥管理 =====
    function loadKey() {
      fetch('/api/admin/key', { headers: { 'X-Admin-Password': sessionPwd } })
        .then(r => r.json())
        .then(d => { document.getElementById('key-textarea').value = d.key; })
        .catch(() => showToast('加载密钥失败', true));
    }

    function saveKey() {
      const key = document.getElementById('key-textarea').value.trim();
      if (!key.startsWith('-----BEGIN')) { showToast('密钥格式不正确，必须以 -----BEGIN 开头', true); return; }
      fetch('/api/admin/key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': sessionPwd },
        body: JSON.stringify({ key })
      }).then(r => r.json()).then(d => {
        if (d.ok) showToast('🔑 密钥已更新，立即生效！');
        else showToast(d.error || '保存失败', true);
      }).catch(() => showToast('保存失败', true));
    }

    // ===== 修改密码 =====
    function changePassword() {
      const oldPwd = document.getElementById('old-pwd').value;
      const newPwd = document.getElementById('new-pwd').value;
      const confirmPwd = document.getElementById('confirm-pwd').value;
      if (!oldPwd || !newPwd || !confirmPwd) { showToast('请填写所有字段', true); return; }
      if (newPwd.length < 4) { showToast('新密码至少需要4位', true); return; }
      if (newPwd !== confirmPwd) { showToast('两次输入的新密码不一致', true); return; }
      fetch('/api/admin/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': sessionPwd },
        body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd })
      }).then(r => r.json()).then(d => {
        if (d.ok) {
          sessionPwd = newPwd;
          document.getElementById('old-pwd').value = '';
          document.getElementById('new-pwd').value = '';
          document.getElementById('confirm-pwd').value = '';
          showToast('🔒 密码已修改成功！');
        } else {
          showToast(d.error || '修改失败', true);
        }
      }).catch(() => showToast('修改失败', true));
    }

    // ===== 全局设备数量限制 =====
    function loadGlobalMaxDevices() {
      fetch('/api/admin/maxDevices', { headers: { 'X-Admin-Password': sessionPwd } })
        .then(r => r.json())
        .then(d => { document.getElementById('global-max-devices').value = d.maxDevices; })
        .catch(() => {});
    }

    function saveGlobalMaxDevices() {
      const val = parseInt(document.getElementById('global-max-devices').value) || 0;
      fetch('/api/admin/maxDevices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': sessionPwd },
        body: JSON.stringify({ maxDevices: val })
      }).then(r => r.json()).then(d => {
        if (d.ok) showToast('📱 全局设备上限已保存！');
        else showToast(d.error || '保存失败', true);
      }).catch(() => showToast('保存失败', true));
    }

    // ===== 设备管理 =====
    function viewDevices(id, token) {
      document.getElementById('devices-current-id').value = id;
      document.getElementById('devices-current-token').value = token;
      const list = document.getElementById('devices-list');
      list.innerHTML = '<div class="text-gray-500 text-sm text-center py-4">加载中...</div>';
      document.getElementById('devices-modal').classList.remove('hidden');
      setTimeout(() => {
        document.getElementById('devices-modal').classList.remove('opacity-0');
        document.getElementById('devices-modal-box').classList.remove('scale-95');
      }, 10);
      fetch('/api/subs/' + id + '/devices', { headers: { 'X-Admin-Password': sessionPwd } })
        .then(r => r.json())
        .then(devices => {
          if (devices.length === 0) {
            list.innerHTML = '<div class="text-gray-500 text-sm text-center py-4">暂无设备接入记录</div>';
            return;
          }
          list.innerHTML = devices.map(function(d) {
            const date = new Date(d.firstSeen).toLocaleString('zh-CN');
            return '<div class="flex items-center justify-between bg-gray-900 rounded-lg px-3 py-2 gap-4">' +
              '<span class="font-mono text-cyan-400 text-sm">' + d.ip + '</span>' +
              '<span class="text-gray-500 text-xs whitespace-nowrap">' + date + '</span>' +
              '</div>';
          }).join('');
        })
        .catch(() => { list.innerHTML = '<div class="text-rose-400 text-sm text-center py-4">加载失败</div>'; });
    }

    function closeDevicesModal() {
      document.getElementById('devices-modal').classList.add('opacity-0');
      document.getElementById('devices-modal-box').classList.add('scale-95');
      setTimeout(() => document.getElementById('devices-modal').classList.add('hidden'), 300);
    }

    function doClearDevices() {
      const id = document.getElementById('devices-current-id').value;
      if (!confirm('确定要清除该订阅的所有设备记录吗？清除后用户需重新接入。')) return;
      fetch('/api/subs/' + id + '/devices', {
        method: 'DELETE',
        headers: { 'X-Admin-Password': sessionPwd }
      }).then(r => r.json()).then(d => {
        if (d.ok) {
          closeDevicesModal();
          renderSubs();
          showToast('✅ 已清除所有设备记录！');
        } else {
          showToast(d.error || '清除失败', true);
        }
      }).catch(() => showToast('清除失败', true));
    }
  </script>
</body>
</html>`;

// ===== 工具: 获取真实客户端IP =====
function getClientIp(req: import('express').Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return (Array.isArray(fwd) ? fwd[0] : fwd).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// ===== 鉴权中间件 =====
function requireAdmin(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  const pwd = req.headers['x-admin-password'] as string | undefined;
  if (pwd !== adminPassword) {
    return res.status(401).json({ error: '密码错误或未授权' });
  }
  next();
}

// ===== API: 管理员登录验证 =====
router.post('/admin/login', (req, res) => {
  const { password } = req.body as { password?: string };
  if (password === adminPassword) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: '密码错误' });
  }
});

// ===== API: 密钥管理 =====
router.get('/admin/key', requireAdmin, (_req, res) => {
  res.json({ key: getPrivateKey() });
});

router.put('/admin/key', requireAdmin, (req, res) => {
  const { key } = req.body as { key?: string };
  if (!key || typeof key !== 'string' || !key.trim().startsWith('-----BEGIN')) {
    return res.status(400).json({ error: '密钥格式不正确' });
  }
  setPrivateKey(key.trim());
  res.json({ ok: true });
});

// ===== API: 修改管理员密码 =====
router.put('/admin/password', requireAdmin, (req, res) => {
  const { oldPassword, newPassword } = req.body as { oldPassword?: string; newPassword?: string };
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: '参数错误' });
  }
  if (oldPassword !== adminPassword) {
    return res.status(401).json({ error: '当前密码错误' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: '新密码至少需要4位' });
  }
  adminPassword = newPassword;
  saveAdminPassword(newPassword);
  res.json({ ok: true });
});

// ===== API: 清除节点变化标记 =====
router.post('/clear-changes', (req, res) => {
  const pwd = req.headers['x-admin-password'] as string | undefined;
  if (pwd !== adminPassword) return res.status(401).json({ error: '未授权' });
  nodeData.changedNodeNames.clear();
  res.json({ ok: true });
});

// ===== API: 节点状态 =====
router.get('/status', (_req, res) => {
  res.json({
    count: nodeData.nodes.length,
    lastUpdate: nodeData.lastUpdate,
    status: nodeData.status,
    nodes: nodeData.nodes,
    changedNodeNames: Array.from(nodeData.changedNodeNames),
  });
});

// ===== API: 订阅管理 CRUD =====
router.get('/subs', async (_req, res) => {
  const subs = listSubscriptions();
  const tokens = subs.map(s => s.token);
  const countMap = await getDeviceCountBatch(tokens);
  res.json(subs.map(s => ({ ...s, deviceCount: countMap[s.token] ?? 0 })));
});

router.post('/subs', (req, res) => {
  const { name, expireAt, maxDevices } = req.body as { name?: string; expireAt?: number; maxDevices?: number };
  if (!name || typeof name !== 'string' || !expireAt || typeof expireAt !== 'number') {
    return res.status(400).json({ error: '参数错误' });
  }
  if (expireAt <= Date.now()) {
    return res.status(400).json({ error: '到期时间必须是未来的时间' });
  }
  let resolvedMax = typeof maxDevices === 'number' && maxDevices >= 0 ? Math.floor(maxDevices) : 0;
  if (maxDevicesGlobal > 0 && (resolvedMax === 0 || resolvedMax > maxDevicesGlobal)) {
    resolvedMax = maxDevicesGlobal;
  }
  const daysRemaining = Math.ceil((expireAt - Date.now()) / (1000 * 60 * 60 * 24));
  const sub = createSubscription(name.trim(), daysRemaining, resolvedMax);
  res.status(201).json(sub);
});

router.put('/subs/:id', (req, res) => {
  const { name, expireAt, maxDevices } = req.body as { name?: string; expireAt?: number; maxDevices?: number };
  if (!name && !expireAt && maxDevices === undefined) return res.status(400).json({ error: '参数错误' });
  const updates: { name?: string; expireAt?: number; maxDevices?: number } = {};
  if (name && typeof name === 'string') updates.name = name.trim();
  if (expireAt && typeof expireAt === 'number') {
    if (expireAt <= Date.now()) return res.status(400).json({ error: '到期时间必须是未来的时间' });
    updates.expireAt = expireAt;
  }
  if (typeof maxDevices === 'number' && maxDevices >= 0) {
    let resolvedMax = Math.floor(maxDevices);
    if (maxDevicesGlobal > 0 && (resolvedMax === 0 || resolvedMax > maxDevicesGlobal)) {
      resolvedMax = maxDevicesGlobal;
    }
    updates.maxDevices = resolvedMax;
  }
  const updated = updateSubscriptionById(req.params.id, updates);
  if (updated) res.json(updated);
  else res.status(404).json({ error: '订阅不存在' });
});

router.delete('/subs/:id', (req, res) => {
  const deleted = deleteSubscriptionById(req.params.id);
  if (deleted) {
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: '订阅不存在' });
  }
});

// ===== API: 站点标题 =====
router.get('/admin/title', (_req, res) => {
  res.json({ title: siteTitle });
});

router.put('/admin/title', requireAdmin, (req, res) => {
  const { title } = req.body as { title?: string };
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: '标题不能为空' });
  }
  siteTitle = title.trim();
  persistSiteTitle(siteTitle);
  res.json({ ok: true });
});

// ===== 订阅接口: Clash =====
router.get('/sub/clash', (req, res) => {
  if (nodeData.nodes.length === 0) {
    return res.status(503).send('节点未准备好，请稍后再试');
  }
  res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="fanvpn_clash.yaml"');
  //res.setHeader('Subscription-Userinfo', `upload=0; download=0; total=0; expire=4102444800`);
  res.send(buildClashYaml());
});

router.get('/sub/clash/:token', async (req, res) => {
  const sub = findSubscriptionByToken(req.params.token);
  if (!sub) return res.status(404).send('订阅不存在');

  res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="fanvpn_clash.yaml"');

  if (Date.now() > sub.expireAt) {
    res.setHeader('Subscription-Userinfo', `upload=0; download=0; total=0; expire=1`);
    return res.send(buildExpiredClashYaml());
  }

  if (nodeData.nodes.length === 0) return res.status(503).send('节点未准备好，请稍后再试');

  if (sub.maxDevices > 0) {
    const ip = getClientIp(req);
    const { allowed } = await checkAndRegisterDevice(sub.token, ip, sub.maxDevices);
    if (!allowed) return res.status(403).send(`设备数已达上限 (${sub.maxDevices})，如需更换设备请联系管理员`);
  }

  const expireSeconds = Math.floor(sub.expireAt / 1000);
  //res.setHeader('Subscription-Userinfo', `upload=0; download=0; total=0; expire=${expireSeconds}`);
  res.send(buildClashYaml());
});

// ===== 订阅接口: Base64 =====
router.get('/sub/base64', (req, res) => {
  if (nodeData.nodes.length === 0) return res.status(503).send('节点未准备好');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(buildBase64());
});

router.get('/sub/base64/:token', async (req, res) => {
  const sub = findSubscriptionByToken(req.params.token);
  if (!sub) return res.status(404).send('订阅不存在');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  if (Date.now() > sub.expireAt) {
    return res.send(buildExpiredBase64());
  }

  if (nodeData.nodes.length === 0) return res.status(503).send('节点未准备好');

  if (sub.maxDevices > 0) {
    const ip = getClientIp(req);
    const { allowed } = await checkAndRegisterDevice(sub.token, ip, sub.maxDevices);
    if (!allowed) return res.status(403).send(`设备数已达上限 (${sub.maxDevices})，如需更换设备请联系管理员`);
  }

  res.send(buildBase64());
});

// ===== 面板 =====
router.get('/dashboard', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(DASHBOARD_HTML);
});

// ===== API: 全局设备数量上限 =====
router.get('/admin/maxDevices', requireAdmin, (_req, res) => {
  res.json({ maxDevices: maxDevicesGlobal });
});

router.put('/admin/maxDevices', requireAdmin, (req, res) => {
  const { maxDevices } = req.body as { maxDevices?: number };
  if (typeof maxDevices !== 'number' || maxDevices < 0) {
    return res.status(400).json({ error: '参数错误，必须为非负整数' });
  }
  maxDevicesGlobal = Math.floor(maxDevices);
  saveSetting('maxDevicesGlobal', String(maxDevicesGlobal)).catch(console.error);
  res.json({ ok: true, maxDevices: maxDevicesGlobal });
});

// ===== API: 设备管理 =====
router.get('/subs/:id/devices', requireAdmin, async (req, res) => {
  const subs = listSubscriptions();
  const sub = subs.find(s => s.id === req.params.id);
  if (!sub) return res.status(404).json({ error: '订阅不存在' });
  const devices = await listDevices(sub.token);
  res.json(devices);
});

router.delete('/subs/:id/devices', requireAdmin, async (req, res) => {
  const subs = listSubscriptions();
  const sub = subs.find(s => s.id === req.params.id);
  if (!sub) return res.status(404).json({ error: '订阅不存在' });
  await clearDevices(sub.token);
  res.json({ ok: true });
});

// ===== 工具函数 =====
function buildClashYaml(): string {
  const proxyNames: string[] = [];
  const proxyLines: string[] = [];
  nodeData.nodes.forEach(node => {
    const safeName = node.name.replace(/["\n]/g, '');
    proxyNames.push(safeName);
    proxyLines.push(`  - name: "${safeName}"`);
    proxyLines.push(`    type: http`);
    proxyLines.push(`    server: ${node.server}`);
    proxyLines.push(`    port: ${node.port}`);
    proxyLines.push(`    tls: true`);
  });

  return [
    'mixed-port: 7890',
    'allow-lan: false',
    'mode: rule',
    'log-level: info',
    'external-controller: 127.0.0.1:9090',
    '',
    'proxies:',
    ...proxyLines,
    '',
    'proxy-groups:',
    '  - name: "\uD83D\uDE80 节点选择"',
    '    type: select',
    '    proxies:',
    '    - "\u267B\uFE0F 自动选择"',
    '    - DIRECT',
    ...proxyNames.map(n => `    - "${n}"`),
    '',
    '  - name: "\u267B\uFE0F 自动选择"',
    '    type: url-test',
    '    url: http://www.gstatic.com/generate_204',
    '    interval: 300',
    '    proxies:',
    ...proxyNames.map(n => `    - "${n}"`),
    '',
    'rules:',
    '  - MATCH,\uD83D\uDE80 节点选择',
  ].join('\n');
}

function buildBase64(): string {
  const lines = nodeData.nodes.map(n => `https://${n.server}:${n.port}#${encodeURIComponent(n.name)}`).join('\n');
  return Buffer.from(lines).toString('base64');
}

const EXPIRED_NODE_NAME = '❌ 您的服务已到期，请联系管理员续费';
const EXPIRED_SERVER = '127.0.0.1';
const EXPIRED_PORT = 65535;

function buildExpiredClashYaml(): string {
  return [
    'mixed-port: 7890',
    'allow-lan: false',
    'mode: rule',
    'log-level: info',
    'external-controller: 127.0.0.1:9090',
    '',
    'proxies:',
    `  - name: "${EXPIRED_NODE_NAME}"`,
    `    type: http`,
    `    server: ${EXPIRED_SERVER}`,
    `    port: ${EXPIRED_PORT}`,
    `    tls: false`,
    '',
    'proxy-groups:',
    `  - name: "🚀 节点选择"`,
    `    type: select`,
    `    proxies:`,
    `    - "${EXPIRED_NODE_NAME}"`,
    '',
    `  - name: "♻️ 自动选择"`,
    `    type: url-test`,
    `    url: http://www.gstatic.com/generate_204`,
    `    interval: 300`,
    `    proxies:`,
    `    - "${EXPIRED_NODE_NAME}"`,
    '',
    'rules:',
    '  - MATCH,🚀 节点选择',
  ].join('\n');
}

function buildExpiredBase64(): string {
  const line = `https://${EXPIRED_SERVER}:${EXPIRED_PORT}#${encodeURIComponent(EXPIRED_NODE_NAME)}`;
  return Buffer.from(line).toString('base64');
}

export default router;
