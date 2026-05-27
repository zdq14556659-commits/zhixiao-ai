import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import dayjs from 'dayjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ─── 路径与配置 ──────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = 'zhixiao-ai-jwt-secret-key-2026-very-long-and-secure';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DB_PATH = path.join(__dirname, 'data.db');
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR });

app.use(cors());
app.use(express.json());

// ─── 数据库初始化 ────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// DROP existing tables to start fresh (development mode)
// In production you'd use migrations; for this demo we recreate.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL DEFAULT 1,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    real_name TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    job_title TEXT DEFAULT '',
    department TEXT DEFAULT '',
    status INTEGER DEFAULT 1,
    last_login_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL DEFAULT 1,
    owner_id INTEGER,
    name TEXT NOT NULL,
    industry TEXT DEFAULT '',
    source TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    stage TEXT DEFAULT '潜在客户',
    tags TEXT DEFAULT '',
    intention_level INTEGER DEFAULT 0,
    estimated_amount REAL DEFAULT 0,
    next_contact_at TEXT,
    remark TEXT DEFAULT '',
    status INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    name TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    position TEXT DEFAULT '',
    is_decision_maker INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS clues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL DEFAULT 1,
    owner_id INTEGER,
    customer_name TEXT DEFAULT '',
    contact_name TEXT DEFAULT '',
    contact_phone TEXT DEFAULT '',
    source TEXT DEFAULT '',
    industry TEXT DEFAULT '',
    status TEXT DEFAULT '待分配',
    converted_customer_id INTEGER,
    assigned_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL DEFAULT 1,
    customer_id INTEGER NOT NULL,
    owner_id INTEGER,
    name TEXT NOT NULL,
    stage TEXT DEFAULT '需求确认',
    amount REAL DEFAULT 0,
    probability INTEGER DEFAULT 0,
    expected_closed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL DEFAULT 1,
    customer_id INTEGER NOT NULL,
    opportunity_id INTEGER,
    order_no TEXT UNIQUE NOT NULL,
    amount REAL DEFAULT 0,
    status TEXT DEFAULT '待确认',
    sign_date TEXT,
    delivery_date TEXT
  );

  CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL DEFAULT 1,
    customer_id INTEGER,
    owner_id INTEGER,
    file_name TEXT DEFAULT '',
    file_path TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 0,
    call_type TEXT DEFAULT 'phone',
    caller_number TEXT DEFAULT '',
    callee_number TEXT DEFAULT '',
    call_direction TEXT DEFAULT 'outbound',
    call_time TEXT,
    transcribe_status TEXT DEFAULT 'pending',
    transcribe_text TEXT DEFAULT '',
    transcribe_at TEXT,
    analyze_status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL DEFAULT 1,
    recording_id INTEGER NOT NULL,
    summary TEXT DEFAULT '',
    intention TEXT DEFAULT '',
    intention_confidence REAL DEFAULT 0,
    customer_emotion TEXT DEFAULT '',
    customer_emotion_score REAL DEFAULT 0,
    agent_performance_score REAL DEFAULT 0,
    agent_tips TEXT DEFAULT '',
    key_points TEXT DEFAULT '',
    action_items TEXT DEFAULT '',
    customer_demand TEXT DEFAULT '',
    purchase_intent TEXT DEFAULT '',
    risk_warning TEXT DEFAULT '',
    model_used TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS knowledge_base (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL DEFAULT 1,
    category TEXT DEFAULT '',
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    tags TEXT DEFAULT '',
    reference_count INTEGER DEFAULT 0,
    created_by TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS resignations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT DEFAULT '',
    department TEXT DEFAULT '',
    position TEXT DEFAULT '',
    resign_date TEXT,
    customer_count INTEGER DEFAULT 0,
    opportunity_count INTEGER DEFAULT 0,
    handover_status TEXT DEFAULT 'pending',
    handover_to INTEGER,
    handover_at TEXT,
    handover_to_name TEXT DEFAULT ''
  );
`);

// ─── 种子数据 ────────────────────────────────────────────

function seedData() {
  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
  if (userCount > 0) {
    console.log('[DB] 数据表已存在，跳过种子数据');
    return;
  }

  console.log('[DB] 初始化种子数据...');
  const hash = bcrypt.hashSync('admin123', 10);
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const today = dayjs().format('YYYY-MM-DD');

  // ── 用户 ──
  const insertUser = db.prepare(`INSERT INTO users (id,company_id,username,password,real_name,phone,email,job_title,department,status,created_at)
    VALUES (?,1,?,?,?,?,?,?,?,1,?)`);
  insertUser.run(1, 'admin', hash, '管理员', '13800000001', 'admin@zhixiao.com', '系统管理员', '管理部', '2026-01-01');
  insertUser.run(2, 'manager', hash, '王经理', '13800000002', 'manager@zhixiao.com', '销售经理', '销售部', '2026-01-01');
  insertUser.run(3, 'sales01', hash, '李销售', '13800000003', 'sales01@zhixiao.com', '销售顾问', '销售部', '2026-01-01');
  insertUser.run(4, 'sales02', hash, '赵销售', '13800000004', 'sales02@zhixiao.com', '销售顾问', '销售部', '2026-01-01');

  // ── 客户 ──
  const insertCust = db.prepare(`INSERT INTO customers (id,company_id,owner_id,name,industry,source,phone,address,stage,tags,intention_level,estimated_amount,next_contact_at,remark,status,created_at,updated_at)
    VALUES (?,1,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`);
  insertCust.run(1, 3, '红星美凯龙武汉店', '定制家具', '展会', '027-88886666', '武汉市武昌区徐东大街88号', '已成交', '大客户,老客户', 5, 500000, '2026-06-01 10:00', '年度合作客户', '2026-01-15', '2026-05-20');
  insertCust.run(2, 3, '欧派家居武汉分公司', '定制家具', '转介绍', '027-88887777', '武汉市江岸区建设大道588号', '谈判中', '大品牌,高意向', 4, 300000, '2026-05-25 14:00', '需要提供定制化方案', '2026-03-01', '2026-05-21');
  insertCust.run(3, 4, '索菲亚武汉体验店', '定制家具', '自拓', '027-88885555', '武汉市洪山区珞瑜路100号', '意向客户', '连锁,新客户', 3, 200000, '2026-05-28 09:30', '对AI功能感兴趣', '2026-04-10', '2026-05-20');
  insertCust.run(4, null, '尚品宅配武汉店', '定制家具', '网络', '027-88884444', '武汉市汉阳区龙阳大道66号', '潜在客户', '竞品用户', 2, 100000, null, '目前在用竞品软件', '2026-05-01', '2026-05-15');
  insertCust.run(5, 3, '南京全屋定制工厂', '定制家具', '转介绍', '025-88883333', '南京市江宁区工业园88号', '谈判中', '工厂,大单', 4, 350000, '2026-05-30 15:00', '想上整套数字化方案', '2026-04-01', '2026-05-21');
  insertCust.run(6, null, '成都衣柜定制工作室', '定制家具', '网络', '028-88882222', '成都市武侯区人民南路四段', '潜在客户', '小客户,工作室', 1, 50000, null, '刚成立的小工作室', '2026-05-10', '2026-05-10');

  // ── 联系人 ──
  const insertContact = db.prepare(`INSERT INTO contacts (id,customer_id,name,phone,position,is_decision_maker) VALUES (?,?,?,?,?,?)`);
  insertContact.run(1, 1, '刘总', '13900001111', '采购总监', 1);
  insertContact.run(2, 1, '陈经理', '13900001112', '采购经理', 0);
  insertContact.run(3, 2, '张总', '13900002222', '总经理', 1);
  insertContact.run(4, 3, '李店长', '13900003333', '店长', 1);
  insertContact.run(5, 4, '王经理', '13900004444', '运营经理', 0);
  insertContact.run(6, 5, '赵总', '13900005555', '总经理', 1);

  // ── 线索 ──
  const insertClue = db.prepare(`INSERT INTO clues (id,company_id,owner_id,customer_name,contact_name,contact_phone,source,industry,status,converted_customer_id,assigned_at,created_at)
    VALUES (?,1,?,?,?,?,?,?,?,?,?,?)`);
  insertClue.run(1, 3, '广州定制家具厂', '陈先生', '13612345678', '展会', '定制家具', '已转化', 5, '2026-04-02 10:00', '2026-04-01');
  insertClue.run(2, 4, '西安衣柜工厂', '刘先生', '13712345678', '网络', '定制家具', '跟进中', null, '2026-05-05 14:00', '2026-05-01');
  insertClue.run(3, null, '重庆全屋定制门店', '黄先生', '13812345678', '自拓', '定制家具', '待分配', null, null, '2026-05-15');
  insertClue.run(4, 4, '郑州橱柜加工厂', '吴先生', '13912345678', '转介绍', '定制家具', '跟进中', null, '2026-05-18 09:00', '2026-05-16');

  // ── 商机 ──
  const insertOpp = db.prepare(`INSERT INTO opportunities (id,company_id,customer_id,owner_id,name,stage,amount,probability,expected_closed_at,created_at)
    VALUES (?,1,?,?,?,?,?,?,?,?)`);
  insertOpp.run(1, 1, 3, '红星美凯龙2026年度合作协议', '商务谈判', 500000, 80, '2026-06-30', '2026-03-01');
  insertOpp.run(2, 2, 3, '欧派家居柜柜软件采购', '方案报价', 300000, 50, '2026-07-15', '2026-04-01');
  insertOpp.run(3, 3, 4, '索菲亚武汉店CRM系统', '需求确认', 200000, 30, '2026-08-01', '2026-04-15');
  insertOpp.run(4, 5, 3, '南京工厂数字化升级项目', '方案报价', 350000, 60, '2026-07-01', '2026-04-20');

  // ── 订单 ──
  const insertOrder = db.prepare(`INSERT INTO orders (id,company_id,customer_id,opportunity_id,order_no,amount,status,sign_date,delivery_date)
    VALUES (?,1,?,?,?,?,?,?,?)`);
  insertOrder.run(1, 1, 1, 'ORD-2026-0001', 500000, '已确认', '2026-05-01', '2026-06-15');
  insertOrder.run(2, 3, 3, 'ORD-2026-0002', 200000, '已完成', '2026-04-15', '2026-05-20');

  // ── 离职记录 ──
  const insertResign = db.prepare(`INSERT INTO resignations (id,user_id,name,department,position,resign_date,customer_count,opportunity_count,handover_status,handover_to,handover_at,handover_to_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  insertResign.run(1, 5, '张小丽', '销售部', '销售顾问', '2026-05-15', 3, 1, 'pending', null, null, '');
  insertResign.run(2, 6, '马云飞', '销售部', '销售顾问', '2026-05-10', 5, 2, 'completed', 3, '2026-05-12', '李销售');

  // ── 知识库 ──
  const insertKb = db.prepare(`INSERT INTO knowledge_base (id,company_id,category,title,content,tags,reference_count,created_by,created_at)
    VALUES (?,1,?,?,?,?,?,?,?)`);
  insertKb.run(1, 'product', '柜柜软件核心功能介绍', '柜柜软件是面向全屋定制工厂的专业板材切割与拆单解决方案，支持CAD图纸导入、自动优化排版、智能拆单、一键排产等功能。', '柜柜软件,拆单,排版', 0, '管理员', '2026-01-01');
  insertKb.run(2, 'pricing', '柜柜软件标准报价', '基础版：¥7,980/年；专业版：¥15,800/年；旗舰版：¥29,800/年。支持按需定制功能模块。', '报价,价格', 0, '管理员', '2026-01-01');
  insertKb.run(3, 'qa', '常见客户问题-交货期', '标准交货期为15-20个工作日，加急订单可缩短至10个工作日（需额外加收30%加急费）。', '交货期,FAQ', 0, '管理员', '2026-01-01');
  insertKb.run(4, 'competitor', '竞品对比-柜柜vs其他拆单软件', '柜柜软件相比传统拆单软件的优势：1）AI智能排料，板材利用率提升5-8%；2）深度定制家具行业适用；3）报价系统和生产管理一体化。', '竞品,对比', 0, '管理员', '2026-01-01');
  insertKb.run(5, 'faq', '柜柜软件支持哪些设计软件对接？', '柜柜软件支持对接酷家乐、三维家等主流设计软件，可以直接导入设计方案进行拆单。同时也支持CAD图纸直接导入。', '对接,设计软件', 15, '管理员', '2026-02-01');
  insertKb.run(6, 'faq', '智销AI如何帮助提升销售转化率？', '智销AI通过实时话术推荐、客户意向分析、流失预警三大核心能力帮助提升转化率。根据客户数据，使用智销AI后平均转化率提升约40%。', '转化率,AI', 28, '管理员', '2026-02-10');
  insertKb.run(7, 'pricing', '智销AI系统的定价方案', '基础版：¥2,980/坐席/年（适合1-5人团队）；专业版：¥5,980/坐席/年（适合5-20人团队）；旗舰版：¥9,800/坐席/年（适合20人以上团队）。门店版¥3,980/年（单店3账号）。', '报价,价格,坐席', 42, '管理员', '2026-03-01');
  insertKb.run(8, 'product', '柜柜软件板材利用率提升数据', '采用AI智能排料算法后，板材利用率平均提升5-8%，按一家月产5000张板的工厂计算，每月可节省板材250-400张，相当于每月节省2-3万元成本。', '板材利用率,AI排料', 36, '产品部', '2026-03-15');
  insertKb.run(9, 'process', '新客户接待标准流程', 'Step1: 客户咨询后30分钟内响应。Step2: 了解客户需求并记录进CRM。Step3: 24小时内安排量尺或上门演示。Step4: 3个工作日内出设计方案和报价。Step5: 持续跟进至成交。', '流程,标准,接待', 20, '王经理', '2026-04-01');
  insertKb.run(10, 'competitor', '智销AI vs 销售保AI 对比分析', '智销AI专注定制家居垂直行业，深度理解"量尺-设计-拆单-报价-安装"全流程，与柜柜软件深度集成。销售保AI覆盖280+行业但在定制家居领域缺乏深度。智销AI定价更透明，支持出海多语言。', '竞品,对比,销售保', 18, '管理员', '2026-04-10');

  console.log('[DB] 种子数据初始化完成');
}

seedData();

// ─── 统一响应格式 ──────────────────────────────────────────

const success = (data = null) => ({ code: 200, message: 'success', data });
const created = (data) => ({ code: 201, message: 'created', data });
const paged = (list, total, page = 1, size = 10) => ({
  code: 200, message: 'success',
  data: { records: list, total, page, size, pages: Math.ceil(total / size) }
});

// ─── JWT 中间件 ────────────────────────────────────────────

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未登录', data: null });
  }
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ code: 401, message: 'Token无效', data: null });
  }
}

// ─── 认证 API ────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '请输入用户名和密码', data: null });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(400).json({ code: 400, message: '用户名或密码错误', data: null });
  }
  if (user.status === 0) {
    return res.status(400).json({ code: 400, message: '账号已被禁用', data: null });
  }
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({ code: 400, message: '用户名或密码错误', data: null });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, user.id);
  res.json(success({
    token,
    userId: user.id,
    username: user.username,
    realName: user.real_name,
    avatar: user.avatar,
    email: user.email,
    role: user.id === 1 ? 'SUPER_ADMIN' : (user.id === 2 ? 'SALES_MANAGER' : 'SALES_REP')
  }));
});

app.post('/api/auth/register', (req, res) => {
  const { username, password, realName, phone, email } = req.body;
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ code: 400, message: '用户名已存在', data: null });
  }
  const hash = bcrypt.hashSync(password, 10);
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const result = db.prepare(
    'INSERT INTO users (company_id,username,password,real_name,phone,email,created_at) VALUES (1,?,?,?,?,?,?)'
  ).run(username, hash, realName || '', phone || '', email || '', now);
  const newId = result.lastInsertRowid;
  const token = jwt.sign({ id: newId, username }, JWT_SECRET, { expiresIn: '24h' });
  res.json(created({ token, userId: newId, username, realName: realName || '', avatar: '', email: email || '', role: 'SALES_REP' }));
});

app.get('/api/user/profile', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ code: 404, message: '用户不存在', data: null });
  const { password, ...profile } = user;
  res.json(success(profile));
});

// ─── 用户管理 API ──────────────────────────────────────────

app.get('/api/users', authMiddleware, (req, res) => {
  const users = db.prepare('SELECT id,company_id,username,real_name,phone,email,avatar,job_title,department,status,last_login_at,created_at FROM users').all();
  res.json(success(users));
});

app.post('/api/users', authMiddleware, (req, res) => {
  const { username, password, realName, phone, email, jobTitle, department, roles } = req.body;
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ code: 400, message: '用户名已存在', data: null });
  }
  const hash = bcrypt.hashSync(password, 10);
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const result = db.prepare(
    'INSERT INTO users (company_id,username,password,real_name,phone,email,job_title,department,created_at) VALUES (1,?,?,?,?,?,?,?,?)'
  ).run(username, hash, realName || '', phone || '', email || '', jobTitle || '', department || '', now);
  res.json(created({ id: result.lastInsertRowid, ...req.body }));
});

app.put('/api/users/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ code: 404, message: '用户不存在', data: null });
  const { username, realName, phone, email, jobTitle, department, status, password } = req.body;
  let updateSQL = 'UPDATE users SET ';
  const params = [];
  const fields = [];
  if (realName !== undefined) { fields.push('real_name = ?'); params.push(realName); }
  if (phone !== undefined) { fields.push('phone = ?'); params.push(phone); }
  if (email !== undefined) { fields.push('email = ?'); params.push(email); }
  if (jobTitle !== undefined) { fields.push('job_title = ?'); params.push(jobTitle); }
  if (department !== undefined) { fields.push('department = ?'); params.push(department); }
  if (status !== undefined) { fields.push('status = ?'); params.push(status); }
  if (password) {
    fields.push('password = ?');
    params.push(bcrypt.hashSync(password, 10));
  }
  fields.push('username = ?'); params.push(username || user.username);
  params.push(id);
  db.prepare(updateSQL + fields.join(',') + ' WHERE id = ?').run(...params);
  res.json(success({ id, ...req.body }));
});

app.delete('/api/users/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ code: 404, message: '用户不存在', data: null });
  db.prepare('UPDATE users SET status = 0 WHERE id = ?').run(id);
  res.json(success(null));
});

// ─── 客户管理 API ──────────────────────────────────────────

app.get('/api/customers', authMiddleware, (req, res) => {
  const { page = 1, size = 10, name, phone, stage, ownerId } = req.query;
  let sql = `SELECT c.*, u.real_name as ownerName FROM customers c LEFT JOIN users u ON c.owner_id = u.id WHERE c.status = 1`;
  const params = [];
  if (name) { sql += ' AND c.name LIKE ?'; params.push(`%${name}%`); }
  if (phone) { sql += ' AND c.phone LIKE ?'; params.push(`%${phone}%`); }
  if (stage) { sql += ' AND c.stage = ?'; params.push(stage); }
  if (ownerId) { sql += ' AND c.owner_id = ?'; params.push(parseInt(ownerId)); }
  const countSql = sql.replace(/SELECT c\.\*.*FROM/, 'SELECT COUNT(*) as total FROM');
  const total = db.prepare(countSql).get(...params).total;
  const offset = (parseInt(page) - 1) * parseInt(size);
  sql += ' ORDER BY c.id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(size), offset);
  const list = db.prepare(sql).all(...params);
  res.json(paged(list, total, parseInt(page), parseInt(size)));
});

app.get('/api/customers/:id', authMiddleware, (req, res) => {
  const cust = db.prepare('SELECT c.*, u.real_name as ownerName FROM customers c LEFT JOIN users u ON c.owner_id = u.id WHERE c.id = ?').get(parseInt(req.params.id));
  if (!cust) return res.status(404).json({ code: 404, message: '客户不存在', data: null });
  res.json(success(cust));
});

app.get('/api/customers/:id/detail', authMiddleware, (req, res) => {
  const custId = parseInt(req.params.id);
  const cust = db.prepare('SELECT c.*, u.real_name as ownerName FROM customers c LEFT JOIN users u ON c.owner_id = u.id WHERE c.id = ?').get(custId);
  if (!cust) return res.status(404).json({ code: 404, message: '客户不存在', data: null });
  const custContacts = db.prepare('SELECT * FROM contacts WHERE customer_id = ?').all(custId);
  const custOpps = db.prepare(`SELECT o.*, c.name as customerName, u.real_name as ownerName FROM opportunities o
    LEFT JOIN customers c ON o.customer_id = c.id LEFT JOIN users u ON o.owner_id = u.id WHERE o.customer_id = ?`).all(custId);
  const custOrders = db.prepare(`SELECT o.*, c.name as customerName FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE o.customer_id = ?`).all(custId);
  const custRecordings = db.prepare(`SELECT r.*, u.real_name as ownerName FROM recordings r LEFT JOIN users u ON r.owner_id = u.id WHERE r.customer_id = ?`).all(custId);
  const communications = [
    { id: 1, customerId: custId, commType: 'phone', subject: '初步沟通产品需求', content: '客户表示对AI销售系统感兴趣', commTime: '2026-05-15 10:30', ownerName: cust.ownerName },
    { id: 2, customerId: custId, commType: 'wechat', subject: '发送产品资料', content: '发送了产品介绍和报价单', commTime: '2026-05-16 14:20', ownerName: cust.ownerName },
    { id: 3, customerId: custId, commType: 'meeting', subject: '上门演示', content: '在公司会议室进行了产品演示，客户比较满意', commTime: '2026-05-18 09:00', ownerName: cust.ownerName },
  ];
  res.json(success({ ...cust, contacts: custContacts, opportunities: custOpps, orders: custOrders, recordings: custRecordings, communications }));
});

app.post('/api/customers', authMiddleware, (req, res) => {
  const body = req.body;
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const result = db.prepare(
    `INSERT INTO customers (company_id,owner_id,name,industry,source,phone,address,stage,tags,intention_level,estimated_amount,next_contact_at,remark,status,created_at,updated_at)
     VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`
  ).run(
    req.user.id, body.name, body.industry || '', body.source || '', body.phone || '',
    body.address || '', body.stage || '潜在客户', body.tags || '', body.intentionLevel || 0,
    body.estimatedAmount || 0, body.nextContactAt || null, body.remark || '', now, now
  );
  const newCust = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
  res.json(created(newCust));
});

app.put('/api/customers/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!cust) return res.status(404).json({ code: 404, message: '客户不存在', data: null });
  const b = req.body;
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare(`UPDATE customers SET
    name=?, industry=?, source=?, phone=?, address=?, stage=?, tags=?,
    intention_level=?, estimated_amount=?, next_contact_at=?, remark=?, updated_at=?
    WHERE id=?`).run(
    b.name || cust.name, b.industry !== undefined ? b.industry : cust.industry,
    b.source !== undefined ? b.source : cust.source,
    b.phone !== undefined ? b.phone : cust.phone,
    b.address !== undefined ? b.address : cust.address,
    b.stage !== undefined ? b.stage : cust.stage,
    b.tags !== undefined ? b.tags : cust.tags,
    b.intentionLevel !== undefined ? b.intentionLevel : cust.intention_level,
    b.estimatedAmount !== undefined ? b.estimatedAmount : cust.estimated_amount,
    b.nextContactAt !== undefined ? b.nextContactAt : cust.next_contact_at,
    b.remark !== undefined ? b.remark : cust.remark, now, id
  );
  const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  res.json(success(updated));
});

app.delete('/api/customers/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!cust) return res.status(404).json({ code: 404, message: '客户不存在', data: null });
  db.prepare('UPDATE customers SET status = 0 WHERE id = ?').run(id);
  res.json(success(null));
});

// ─── 联系人 API ──────────────────────────────────────────

app.get('/api/customers/:customerId/contacts', authMiddleware, (req, res) => {
  const list = db.prepare('SELECT * FROM contacts WHERE customer_id = ?').all(parseInt(req.params.customerId));
  res.json(success(list));
});

app.post('/api/customers/:customerId/contacts', authMiddleware, (req, res) => {
  const customerId = parseInt(req.params.customerId);
  const { name, phone, position, isDecisionMaker } = req.body;
  const result = db.prepare(
    'INSERT INTO contacts (customer_id,name,phone,position,is_decision_maker) VALUES (?,?,?,?,?)'
  ).run(customerId, name || '', phone || '', position || '', isDecisionMaker ? 1 : 0);
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid);
  res.json(created(contact));
});

app.delete('/api/contacts/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  if (!contact) return res.status(404).json({ code: 404, message: '联系人不存在', data: null });
  db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
  res.json(success(null));
});

// ─── 线索管理 API ──────────────────────────────────────────

app.get('/api/clues', authMiddleware, (req, res) => {
  const { page = 1, size = 10, status } = req.query;
  let sql = `SELECT c.*, u.real_name as ownerName FROM clues c LEFT JOIN users u ON c.owner_id = u.id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND c.status = ?'; params.push(status); }
  const countSql = sql.replace(/SELECT c\.\*.*FROM/, 'SELECT COUNT(*) as total FROM');
  const total = db.prepare(countSql).get(...params).total;
  const offset = (parseInt(page) - 1) * parseInt(size);
  sql += ' ORDER BY c.id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(size), offset);
  const list = db.prepare(sql).all(...params);
  res.json(paged(list, total, parseInt(page), parseInt(size)));
});

app.post('/api/clues', authMiddleware, (req, res) => {
  const body = req.body;
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const result = db.prepare(
    `INSERT INTO clues (company_id,customer_name,contact_name,contact_phone,source,industry,status,created_at)
     VALUES (1,?,?,?,?,?,'待分配',?)`
  ).run(body.customerName || '', body.contactName || '', body.contactPhone || '', body.source || '', body.industry || '', now);
  const clue = db.prepare('SELECT * FROM clues WHERE id = ?').get(result.lastInsertRowid);
  res.json(created(clue));
});

app.put('/api/clues/:id/assign', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const clue = db.prepare('SELECT * FROM clues WHERE id = ?').get(id);
  if (!clue) return res.status(404).json({ code: 404, message: '线索不存在', data: null });
  const { ownerId } = req.body;
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const assignedUser = db.prepare('SELECT real_name FROM users WHERE id = ?').get(ownerId);
  db.prepare('UPDATE clues SET owner_id=?, status=\'跟进中\', assigned_at=? WHERE id=?').run(ownerId, now, id);
  const updated = db.prepare('SELECT c.*, u.real_name as ownerName FROM clues c LEFT JOIN users u ON c.owner_id = u.id WHERE c.id = ?').get(id);
  res.json(success(updated));
});

// ─── 商机 / 销售漏斗 API ──────────────────────────────────

app.get('/api/opportunities', authMiddleware, (req, res) => {
  const { page = 1, size = 10, stage } = req.query;
  let sql = `SELECT o.*, c.name as customerName, u.real_name as ownerName FROM opportunities o
    LEFT JOIN customers c ON o.customer_id = c.id LEFT JOIN users u ON o.owner_id = u.id WHERE 1=1`;
  const params = [];
  if (stage) { sql += ' AND o.stage = ?'; params.push(stage); }
  const countSql = sql.replace(/SELECT o\.\*.*FROM/, 'SELECT COUNT(*) as total FROM');
  const total = db.prepare(countSql.replace(/ LEFT JOIN.*/, '')).get(...params).total;
  const offset = (parseInt(page) - 1) * parseInt(size);
  sql += ' ORDER BY o.id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(size), offset);
  const list = db.prepare(sql).all(...params);
  res.json(paged(list, total, parseInt(page), parseInt(size)));
});

app.post('/api/opportunities', authMiddleware, (req, res) => {
  const body = req.body;
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const result = db.prepare(
    `INSERT INTO opportunities (company_id,customer_id,owner_id,name,stage,amount,probability,expected_closed_at,created_at)
     VALUES (1,?,?,?,?,?,?,?,?)`
  ).run(body.customerId, req.user.id, body.name, body.stage || '需求确认', body.amount || 0, body.probability || 0, body.expectedClosedAt || null, now);
  const opp = db.prepare('SELECT o.*, c.name as customerName, u.real_name as ownerName FROM opportunities o LEFT JOIN customers c ON o.customer_id = c.id LEFT JOIN users u ON o.owner_id = u.id WHERE o.id = ?').get(result.lastInsertRowid);
  res.json(created(opp));
});

app.put('/api/opportunities/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);
  if (!opp) return res.status(404).json({ code: 404, message: '商机不存在', data: null });
  const b = req.body;
  const sql = `UPDATE opportunities SET name=?, stage=?, amount=?, probability=?, expected_closed_at=? WHERE id=?`;
  db.prepare(sql).run(
    b.name || opp.name, b.stage || opp.stage,
    b.amount !== undefined ? b.amount : opp.amount,
    b.probability !== undefined ? b.probability : opp.probability,
    b.expectedClosedAt !== undefined ? b.expectedClosedAt : opp.expected_closed_at, id
  );
  const updated = db.prepare('SELECT o.*, c.name as customerName, u.real_name as ownerName FROM opportunities o LEFT JOIN customers c ON o.customer_id = c.id LEFT JOIN users u ON o.owner_id = u.id WHERE o.id = ?').get(id);
  res.json(success(updated));
});

app.put('/api/opportunities/:id/stage', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);
  if (!opp) return res.status(404).json({ code: 404, message: '商机不存在', data: null });
  const { stage, probability } = req.body;
  db.prepare('UPDATE opportunities SET stage=?, probability=? WHERE id=?').run(stage, probability || opp.probability, id);
  const updated = db.prepare('SELECT o.*, c.name as customerName, u.real_name as ownerName FROM opportunities o LEFT JOIN customers c ON o.customer_id = c.id LEFT JOIN users u ON o.owner_id = u.id WHERE o.id = ?').get(id);
  res.json(success(updated));
});

// ─── 订单管理 API ──────────────────────────────────────────

app.get('/api/orders', authMiddleware, (req, res) => {
  const { page = 1, size = 10, status } = req.query;
  let sql = `SELECT o.*, c.name as customerName FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND o.status = ?'; params.push(status); }
  const countSql = sql.replace(/SELECT o\.\*.*FROM/, 'SELECT COUNT(*) as total FROM');
  const total = db.prepare(countSql.replace(/ LEFT JOIN.*/, '')).get(...params).total;
  const offset = (parseInt(page) - 1) * parseInt(size);
  sql += ' ORDER BY o.id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(size), offset);
  const list = db.prepare(sql).all(...params);
  res.json(paged(list, total, parseInt(page), parseInt(size)));
});

app.post('/api/orders', authMiddleware, (req, res) => {
  const body = req.body;
  const orderNo = body.orderNo || `ORD-${dayjs().format('YYYYMMDDHHmmss')}`;
  const now = dayjs().format('YYYY-MM-DD');
  const result = db.prepare(
    `INSERT INTO orders (company_id,customer_id,opportunity_id,order_no,amount,status,sign_date,delivery_date)
     VALUES (1,?,?,?,?,?,?,?)`
  ).run(body.customerId, body.opportunityId || null, orderNo, body.amount || 0, body.status || '待确认', now, body.deliveryDate || null);
  const order = db.prepare('SELECT o.*, c.name as customerName FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE o.id = ?').get(result.lastInsertRowid);
  res.json(created(order));
});

// ─── 录音管理 API ──────────────────────────────────────────

app.get('/api/recordings', authMiddleware, (req, res) => {
  const { page = 1, size = 10 } = req.query;
  let sql = `SELECT r.*, u.real_name as ownerName FROM recordings r LEFT JOIN users u ON r.owner_id = u.id WHERE 1=1`;
  const countSql = sql.replace(/SELECT r\.\*.*FROM/, 'SELECT COUNT(*) as total FROM');
  const total = db.prepare(countSql.replace(/ LEFT JOIN.*/, '')).get().total;
  const offset = (parseInt(page) - 1) * parseInt(size);
  sql += ' ORDER BY r.id DESC LIMIT ? OFFSET ?';
  const list = db.prepare(sql).all(parseInt(size), offset);
  res.json(paged(list, total, parseInt(page), parseInt(size)));
});

app.post('/api/recordings/upload', authMiddleware, upload.single('file'), (req, res) => {
  const body = req.body;
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const result = db.prepare(
    `INSERT INTO recordings (company_id,owner_id,customer_id,file_name,file_path,file_size,duration,call_type,caller_number,callee_number,call_direction,call_time,transcribe_status,analyze_status,created_at)
     VALUES (1,?,?,?,?,?,?,?,?,?,?,?,'pending','pending',?)`
  ).run(
    req.user.id, parseInt(body.customerId) || null,
    req.file?.originalname || '录音文件.wav',
    req.file?.path || '', req.file?.size || 0,
    Math.floor(Math.random() * 300) + 60,
    body.callType || 'phone', body.callerNumber || '13800000000',
    body.calleeNumber || '13900000000', 'outbound',
    body.callTime || now, now
  );
  const recId = Number(result.lastInsertRowid);
  const rec = db.prepare('SELECT r.*, u.real_name as ownerName FROM recordings r LEFT JOIN users u ON r.owner_id = u.id WHERE r.id = ?').get(recId);

  // Simulate ASR after 3s
  setTimeout(() => {
    const transcriptText = '【坐席】您好，我是智销AI的销售顾问，今天给您打电话是想了解一下贵公司最近有没有数字化升级的需求？\n【客户】我们确实在考虑，现在工厂管理还是靠Excel，效率不高。\n【坐席】那太巧了，我们的柜柜拆单软件和智销AI系统正好能解决这个痛点。\n【客户】价格方便说一下吗？\n【坐席】我们的起售价是¥7,980/年，而且首月可以免费试用。\n【客户】价格可以接受，什么时候方便做个演示？\n【坐席】好的，我安排一下，这周五下午2点您看方便吗？\n【客户】可以，那就周五下午2点。';
    const transAt = dayjs().format('YYYY-MM-DD HH:mm:ss');
    db.prepare('UPDATE recordings SET transcribe_status=\'completed\', transcribe_text=?, transcribe_at=? WHERE id=?').run(transcriptText, transAt, recId);
  }, 3000);

  // Simulate AI analysis after 5s
  setTimeout(() => {
    db.prepare('UPDATE recordings SET analyze_status=\'completed\' WHERE id=?').run(recId);
    db.prepare(
      `INSERT INTO analyses (company_id,recording_id,summary,intention,intention_confidence,customer_emotion,customer_emotion_score,agent_performance_score,agent_tips,key_points,action_items,customer_demand,purchase_intent,risk_warning,model_used,created_at)
       VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      recId,
      '客户表示对数字化升级有需求，目前使用Excel管理工厂。销售介绍了柜柜软件和智销AI的功能，并主动询问了价格。客户对¥7,980/年的价格表示可以接受，约定周五下午2点进行产品演示。通话氛围良好，客户意向明确。',
      '询价', 0.92, 'positive', 0.78, 0.85,
      '1. 客户说"价格可以接受"时应及时推进到下一步，做得不错；2. 可以更早地了解客户的具体痛点；3. 建议增加客户案例分享增强说服力。',
      '客户管理靠Excel→希望数字化升级→对¥7,980/年价格认可→约定周五演示',
      '1. 准备演示环境；2. 准备客户行业案例；3. 周五上午再次确认演示时间',
      '工厂数字化管理升级', 'high', '',
      'zhixiao-ai-mock-v1', dayjs().format('YYYY-MM-DD HH:mm:ss')
    );
  }, 5000);

  res.json(created(rec));
});

app.get('/api/recordings/:id/transcript', authMiddleware, (req, res) => {
  const rec = db.prepare('SELECT * FROM recordings WHERE id = ?').get(parseInt(req.params.id));
  if (!rec || !rec.transcribe_text) {
    return res.json(success([]));
  }
  // Parse transcript text into segments for frontend compatibility
  const lines = rec.transcribe_text.split('\n').filter(l => l.trim());
  const segments = lines.map((line, i) => {
    const isAgent = line.startsWith('【坐席】');
    const content = line.replace(/【坐席】|【客户】/g, '').trim();
    return {
      speaker: isAgent ? 'agent' : 'customer',
      content,
      startTime: i * 4000,
      endTime: (i + 1) * 4000,
      seq: i + 1
    };
  });
  res.json(success(segments));
});

// ─── ASR API ───────────────────────────────────────────

app.post('/api/asr/transcribe/:recordingId', authMiddleware, (req, res) => {
  res.json(success({ recordingId: parseInt(req.params.recordingId), status: 'processing' }));
});

app.get('/api/asr/status/:recordingId', authMiddleware, (req, res) => {
  res.json(success({ recordingId: parseInt(req.params.recordingId), status: 'completed' }));
});

// ─── AI分析 API ──────────────────────────────────────────

app.post('/api/ai/analyze/:recordingId', authMiddleware, (req, res) => {
  const recordingId = parseInt(req.params.recordingId);
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare('UPDATE recordings SET analyze_status=\'completed\' WHERE id=?').run(recordingId);
  const result = db.prepare(
    `INSERT INTO analyses (company_id,recording_id,summary,intention,intention_confidence,customer_emotion,customer_emotion_score,agent_performance_score,agent_tips,key_points,action_items,customer_demand,purchase_intent,risk_warning,model_used,created_at)
     VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    recordingId,
    '本次通话客户对产品表现出浓厚兴趣，询问了价格并主动要求演示。客户在工厂管理方面有明确痛点（Excel管理效率低），属于高意向客户。',
    '询价', 0.92, 'positive', 0.78, 0.85,
    '1. 客户痛点识别清晰；2. 价格回应及时；3. 建议增加竞争对手对比话术',
    'Excel管理→数字化需求→价格咨询→要求演示',
    '准备演示环境，准备客户案例',
    '工厂管理数字化', 'high', '',
    'zhixiao-ai-mock-v1', now
  );
  const analysis = db.prepare('SELECT * FROM analyses WHERE id = ?').get(result.lastInsertRowid);
  res.json(created(analysis));
});

app.get('/api/ai/analysis/:id', authMiddleware, (req, res) => {
  const analysis = db.prepare('SELECT * FROM analyses WHERE id = ?').get(parseInt(req.params.id));
  if (!analysis) return res.status(404).json({ code: 404, message: '分析不存在', data: null });
  res.json(success(analysis));
});

// ─── CEO管理看板 API ────────────────────────────

app.get('/api/dashboard/ceo', authMiddleware, (req, res) => {
  const activeCustomers = db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE status = 1').get().cnt;
  res.json(success({
    coreIssues: [
      { id: 1, issue: '跟进转化率偏低', severity: 'critical', value: '23%', benchmark: '35%', gap: '-12%', suggestion: '加强线索筛选，优先跟进高意向客户，减少无效沟通时间' },
      { id: 2, issue: '新客户开发速度放缓', severity: 'warning', value: '12家/月', benchmark: '18家/月', gap: '-33%', suggestion: '增加行业展会投入，优化网络获客渠道，适当加大转介绍激励' },
      { id: 3, issue: '销售话术标准化不足', severity: 'warning', value: '72分', benchmark: '85分', gap: '-13分', suggestion: '提炼销冠话术，建立话术知识库，每周组织话术演练' },
      { id: 4, issue: '高意向客户流失', severity: 'critical', value: '8家', benchmark: '<3家', gap: '+5家', suggestion: '建立流失预警机制，对沉默超过7天的高意向客户主动跟进' },
      { id: 5, issue: '团队人均产出差异大', severity: 'info', value: '1:3.2', benchmark: '<1:1.5', gap: '差距过大', suggestion: '实施师徒制，TOP销售带新人，定期分享成功案例' },
    ],
    salesComparison: {
      dimensions: ['跟进量', '通话时长(min)', '转化率(%)', '客单价(万)', '回款率(%)', '客户满意度'],
      salespersons: [
        { name: '李销售', values: [52, 380, 32, 8.5, 85, 92], deals: 6, amount: 51 },
        { name: '赵销售', values: [45, 320, 28, 6.2, 78, 88], deals: 4, amount: 24.8 },
        { name: '王销售', values: [38, 290, 35, 9.1, 90, 95], deals: 5, amount: 45.5 },
        { name: '陈销售', values: [48, 350, 25, 5.8, 72, 82], deals: 3, amount: 17.4 },
        { name: '刘销售', values: [55, 410, 30, 7.2, 80, 90], deals: 7, amount: 50.4 },
        { name: '周销售', values: [40, 300, 22, 5.5, 68, 78], deals: 3, amount: 16.5 },
        { name: '吴销售', values: [50, 360, 33, 8.8, 82, 91], deals: 5, amount: 44 },
      ],
    },
    executiveSummary: {
      monthRevenue: 1260000,
      revenueTarget: 1500000,
      revenueRate: 84,
      totalDeals: 25,
      avgDealCycle: 18.5,
      avgDealAmount: 50400,
      topPerformer: '李销售',
      teamSize: 7,
      activeCustomers,
      customerGrowth: 12,
    }
  }));
});

// ─── 员工离职交接 API ───────────────────────────

app.get('/api/resignations', authMiddleware, (req, res) => {
  const list = db.prepare(`SELECT r.*, u.real_name as handover_to_name
    FROM resignations r LEFT JOIN users u ON r.handover_to = u.id`).all();
  res.json(success(list));
});

app.get('/api/resignations/:id/customers', authMiddleware, (req, res) => {
  const resign = db.prepare('SELECT * FROM resignations WHERE id = ?').get(parseInt(req.params.id));
  if (!resign) return res.status(404).json({ code: 404, message: '离职记录不存在', data: null });
  const custs = db.prepare('SELECT c.*, u.real_name as ownerName FROM customers c LEFT JOIN users u ON c.owner_id = u.id WHERE c.owner_id = ? AND c.status = 1').all(resign.user_id);
  res.json(success(custs));
});

app.post('/api/resignations/:id/handover', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const resign = db.prepare('SELECT * FROM resignations WHERE id = ?').get(id);
  if (!resign) return res.status(404).json({ code: 404, message: '离职记录不存在', data: null });
  const { handoverToUserId } = req.body;
  const toUser = db.prepare('SELECT * FROM users WHERE id = ?').get(handoverToUserId);
  if (!toUser) return res.status(404).json({ code: 404, message: '交接用户不存在', data: null });

  const now = dayjs().format('YYYY-MM-DD HH:mm');
  const transaction = db.transaction(() => {
    db.prepare('UPDATE resignations SET handover_to=?, handover_status=\'completed\', handover_at=?, handover_to_name=? WHERE id=?')
      .run(handoverToUserId, now, toUser.real_name, id);
    db.prepare('UPDATE customers SET owner_id=? WHERE owner_id=? AND status=1')
      .run(handoverToUserId, resign.user_id);
  });
  transaction();

  const updated = db.prepare(`SELECT r.*, u.real_name as handover_to_name
    FROM resignations r LEFT JOIN users u ON r.handover_to = u.id WHERE r.id = ?`).get(id);
  res.json(success(updated));
});

// ─── 知识库 API ──────────────────────────────────────────

app.get('/api/knowledge/enhanced', authMiddleware, (req, res) => {
  const { category, search, page = 1, size = 20 } = req.query;
  let sql = `SELECT * FROM knowledge_base WHERE company_id = 1`;
  const params = [];
  if (category && category !== 'all') { sql += ' AND category = ?'; params.push(category); }
  if (search) {
    sql += ' AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)';
    const kw = `%${search}%`;
    params.push(kw, kw, kw);
  }
  const countSql = sql.replace(/SELECT \*/, 'SELECT COUNT(*) as total');
  const total = db.prepare(countSql).get(...params).total;
  const offset = (parseInt(page) - 1) * parseInt(size);
  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(size), offset);
  const list = db.prepare(sql).all(...params);
  res.json(paged(list, total, parseInt(page), parseInt(size)));
});

app.get('/api/knowledge/ai-search', authMiddleware, (req, res) => {
  const { q } = req.query;
  if (!q) return res.json(success([]));
  const kw = `%${q}%`;
  const results = db.prepare(
    `SELECT id, title, content, tags, reference_count as referenceCount, category FROM knowledge_base
     WHERE company_id = 1 AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)
     ORDER BY reference_count DESC LIMIT 5`
  ).all(kw, kw, kw);
  const mapped = results.map(k => ({
    id: k.id, title: k.title,
    matchField: k.title.includes(q) ? 'title' : 'content',
    snippet: (k.content || '').slice(0, 80) + '...',
    referenceCount: k.referenceCount || 0,
    category: k.category
  }));
  res.json(success(mapped));
});

app.get('/api/knowledge', authMiddleware, (req, res) => {
  const { category } = req.query;
  let sql = 'SELECT * FROM knowledge_base WHERE company_id = 1';
  const params = [];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  sql += ' ORDER BY id ASC';
  const list = db.prepare(sql).all(...params);
  res.json(success(list));
});

app.post('/api/knowledge', authMiddleware, (req, res) => {
  const body = req.body;
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const result = db.prepare(
    `INSERT INTO knowledge_base (company_id,category,title,content,tags,created_by,created_at)
     VALUES (1,?,?,?,?,?,?)`
  ).run(body.category || '', body.title || '', body.content || '', body.tags || '', body.createdBy || '', now);
  const kb = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(result.lastInsertRowid);
  res.json(created(kb));
});

app.put('/api/knowledge/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const kb = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(id);
  if (!kb) return res.status(404).json({ code: 404, message: '知识不存在', data: null });
  const b = req.body;
  db.prepare('UPDATE knowledge_base SET category=?, title=?, content=?, tags=? WHERE id=?')
    .run(b.category || kb.category, b.title || kb.title, b.content || kb.content, b.tags || kb.tags, id);
  const updated = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(id);
  res.json(success(updated));
});

app.delete('/api/knowledge/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const kb = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(id);
  if (!kb) return res.status(404).json({ code: 404, message: '知识不存在', data: null });
  db.prepare('DELETE FROM knowledge_base WHERE id = ?').run(id);
  res.json(success(null));
});

// ─── 仪表盘 API ──────────────────────────────────────────

app.get('/api/dashboard/summary', authMiddleware, (req, res) => {
  const totalCustomers = db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE status = 1').get().cnt;
  const activeOpps = db.prepare(`SELECT COUNT(*) as cnt FROM opportunities WHERE stage NOT IN ('赢单','输单')`).get().cnt;
  const monthOrders = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status != '已取消'").get().cnt;
  const monthAmount = db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM orders WHERE status != '已取消'").get().total;
  const todayStr = dayjs().format('YYYY-MM-DD');
  const todayFollowups = db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE next_contact_at LIKE ? AND status = 1').get(`${todayStr}%`).cnt;
  const todayTasks = db.prepare(`SELECT id, name as customerName, next_contact_at, intention_level FROM customers
    WHERE next_contact_at IS NOT NULL AND status = 1 ORDER BY next_contact_at ASC LIMIT 5`).all();

  res.json(success({
    totalCustomers, activeOpps, monthOrders, monthAmount, todayFollowups,
    newCustomersTrend: {
      labels: ['05-16', '05-17', '05-18', '05-19', '05-20', '05-21', '05-22'],
      data: [3, 5, 2, 4, 1, 6, 3]
    },
    funnelData: {
      stages: ['线索', '需求确认', '方案报价', '商务谈判', '赢单'],
      counts: [20, 12, 8, 4, 2]
    },
    sourceDistribution: [
      { name: '展会', value: 8 },
      { name: '转介绍', value: 12 },
      { name: '自拓', value: 6 },
      { name: '网络', value: 10 },
      { name: '其他', value: 4 }
    ],
    todayTasks: todayTasks.map(c => ({
      id: c.id,
      customerName: c.customerName,
      task: c.next_contact_at && c.next_contact_at.startsWith(todayStr) ? '今日需跟进' : '待跟进',
      nextContactAt: c.next_contact_at || '',
      priority: c.intention_level >= 4 ? '高' : '中'
    }))
  }));
});

app.get('/api/dashboard/funnel', authMiddleware, (req, res) => {
  res.json(success({
    stages: ['线索', '需求确认', '方案报价', '商务谈判', '赢单'],
    data: [20, 12, 8, 4, 2]
  }));
});

// ─── 角色 API ────────────────────────────────────────────

app.get('/api/roles', authMiddleware, (req, res) => {
  const roles = [
    { id: 1, name: '超级管理员', code: 'SUPER_ADMIN', description: '拥有全部权限', userCount: 1 },
    { id: 2, name: '销售经理', code: 'SALES_MANAGER', description: '管理销售团队', userCount: 1 },
    { id: 3, name: '销售人员', code: 'SALES_REP', description: '普通销售人员', userCount: 2 },
  ];
  res.json(success(roles));
});

app.get('/api/permissions/tree', authMiddleware, (req, res) => {
  const tree = [
    { id: 1, label: '仪表盘', children: [] },
    { id: 2, label: '客户管理', children: [{ id: 3, label: '客户列表' }, { id: 4, label: '线索管理' }] },
    { id: 5, label: '销售漏斗', children: [{ id: 6, label: '商机看板' }, { id: 7, label: '订单管理' }] },
    { id: 8, label: '录音管理', children: [{ id: 9, label: '录音列表' }, { id: 10, label: '转写记录' }] },
    { id: 11, label: 'AI分析', children: [] },
    { id: 13, label: '系统设置', children: [{ id: 14, label: '用户管理' }, { id: 15, label: '角色管理' }, { id: 16, label: '知识库' }] },
  ];
  res.json(success(tree));
});

// ─── 前端静态文件（生产模式）─────────────────────────────

if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  // SPA fallback: serve index.html for any non-API route
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      return res.status(404).json({ code: 404, message: '接口不存在', data: null });
    }
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
  console.log(`[Static] 前端静态目录: ${FRONTEND_DIST}`);
} else {
  console.log(`[Static] 未找到前端构建产物 (${FRONTEND_DIST})，仅提供API服务`);
}

// ─── 上传目录静态服务 ─────────────────────────────────────

app.use('/uploads', express.static(UPLOAD_DIR));

// ─── 全局错误处理 ──────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
});

// ─── 启动 ────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║        智销AI Production API Server                 ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  端口: ${PORT}                                       ║`);
  console.log('║  状态: RUNNING                                      ║');
  console.log('║  数据库: SQLite (data.db)                            ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  登录账号:                                         ║');
  console.log('║    admin   / admin123  (管理员)                      ║');
  console.log('║    manager / admin123  (销售经理)                   ║');
  console.log('║    sales01 / admin123  (销售顾问)                   ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  if (fs.existsSync(FRONTEND_DIST)) {
    console.log(`║  访问地址: http://localhost:${PORT}                      ║`);
  } else {
    console.log(`║  API地址: http://localhost:${PORT}                        ║`);
    console.log('║  提示: 前端尚未构建，请运行 npm run build              ║');
  }
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
});

// ─── 优雅退出 ──────────────────────────────────────────────

process.on('SIGINT', () => {
  console.log('\n[Server] 收到关闭信号，正在退出...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Server] 收到终止信号，正在退出...');
  db.close();
  process.exit(0);
});
