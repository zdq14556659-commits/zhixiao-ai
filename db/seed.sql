-- ============================================
-- 智销AI - 种子数据
-- ============================================

USE zhixiao_ai;

-- 插入默认公司
INSERT INTO sys_company (id, name, code, contact_name, contact_phone, industry, member_count, status)
VALUES (1, '柜柜智销演示公司', 'GG001', '张三', '13800138000', '全屋定制家具', 50, 1);

-- 插入角色
INSERT INTO sys_role (id, company_id, name, code, description) VALUES
(1, 1, '超级管理员', 'SUPER_ADMIN', '拥有全部权限'),
(2, 1, '销售经理', 'SALES_MANAGER', '管理销售团队'),
(3, 1, '销售人员', 'SALES_REP', '普通销售人员');

-- 插入用户 (密码都是: admin123)
INSERT INTO sys_user (id, company_id, username, password, real_name, phone, job_title, department, status) VALUES
(1, 1, 'admin', '$2b$10$XhBIx7En07.lj2RJJGdyruQFL89l3bRnHinSuFxvxWEUKt6wzpO76', '管理员', '13800000001', '系统管理员', '管理部', 1),
(2, 1, 'manager', '$2b$10$XhBIx7En07.lj2RJJGdyruQFL89l3bRnHinSuFxvxWEUKt6wzpO76', '王经理', '13800000002', '销售经理', '销售部', 1),
(3, 1, 'sales01', '$2b$10$XhBIx7En07.lj2RJJGdyruQFL89l3bRnHinSuFxvxWEUKt6wzpO76', '李销售', '13800000003', '销售顾问', '销售部', 1),
(4, 1, 'sales02', '$2b$10$XhBIx7En07.lj2RJJGdyruQFL89l3bRnHinSuFxvxWEUKt6wzpO76', '赵销售', '13800000004', '销售顾问', '销售部', 1);

-- 用户角色关联
INSERT INTO sys_user_role (user_id, role_id) VALUES
(1, 1),
(2, 2),
(3, 3),
(4, 3);

-- 插入权限数据
INSERT INTO sys_permission (id, parent_id, name, code, type, path, icon, sort_order) VALUES
(1, 0, '仪表盘', 'dashboard', 1, '/dashboard', 'Odometer', 1),
(2, 0, '客户管理', 'customer', 1, '/customer', 'User', 2),
(3, 2, '客户列表', 'customer:list', 1, '/customer/list', 'List', 1),
(4, 2, '线索管理', 'customer:clue', 1, '/customer/clue', 'Search', 2),
(5, 0, '销售漏斗', 'sales', 1, '/sales', 'TrendCharts', 3),
(6, 5, '商机看板', 'sales:opportunity', 1, '/sales/opportunity', 'DataBoard', 1),
(7, 5, '订单管理', 'sales:order', 1, '/sales/order', 'Document', 2),
(8, 0, '录音管理', 'recording', 1, '/recording', 'Microphone', 4),
(9, 8, '录音列表', 'recording:list', 1, '/recording/list', 'List', 1),
(10, 8, '转写记录', 'recording:transcription', 1, '/recording/transcription', 'EditPen', 2),
(11, 0, 'AI分析', 'ai', 1, '/ai', 'MagicStick', 5),
(12, 11, '分析看板', 'ai:dashboard', 1, '/ai/dashboard', 'DataAnalysis', 1),
(13, 0, '系统设置', 'system', 1, '/system', 'Setting', 6),
(14, 13, '用户管理', 'system:user', 1, '/system/user', 'UserFilled', 1),
(15, 13, '角色管理', 'system:role', 1, '/system/role', 'Avatar', 2),
(16, 13, '知识库', 'system:knowledge', 1, '/system/knowledge', 'Reading', 3);

-- 插入示例客户
INSERT INTO crm_customer (id, company_id, owner_id, name, industry, source, phone, stage, intention_level, estimated_amount) VALUES
(1, 1, 3, '红星美凯龙武汉店', '定制家具', '展会', '027-88886666', '已成交', 5, 500000.00),
(2, 1, 3, '欧派家居武汉分公司', '定制家具', '转介绍', '027-88887777', '谈判中', 4, 300000.00),
(3, 1, 4, '索菲亚武汉体验店', '定制家具', '自拓', '027-88885555', '意向客户', 3, 200000.00),
(4, 1, 4, '尚品宅配武汉店', '定制家具', '网络', '027-88884444', '潜在客户', 2, 100000.00),
(5, 1, 3, '南京全屋定制工厂', '定制家具', '转介绍', '025-88883333', '谈判中', 4, 350000.00),
(6, 1, NULL, '成都衣柜定制工作室', '定制家具', '网络', '028-88882222', '潜在客户', 0, 50000.00);

-- 插入联系人
INSERT INTO crm_contact (id, customer_id, name, phone, position, is_decision_maker) VALUES
(1, 1, '刘总', '13900001111', '采购总监', 1),
(2, 1, '陈经理', '13900001112', '采购经理', 0),
(3, 2, '张总', '13900002222', '总经理', 1),
(4, 3, '李店长', '13900003333', '店长', 1),
(5, 4, '王经理', '13900004444', '运营经理', 0),
(6, 5, '赵总', '13900005555', '总经理', 1);

-- 插入线索
INSERT INTO crm_clue (id, company_id, owner_id, customer_name, contact_name, contact_phone, source, industry, status, converted_customer_id) VALUES
(1, 1, 3, '广州定制家具厂', '陈先生', '13612345678', '展会', '定制家具', '已转化', 5),
(2, 1, 4, '西安衣柜工厂', '刘先生', '13712345678', '网络', '定制家具', '跟进中', NULL),
(3, 1, NULL, '重庆全屋定制门店', '黄先生', '13812345678', '自拓', '定制家具', '待分配', NULL),
(4, 1, 4, '郑州橱柜加工厂', '吴先生', '13912345678', '转介绍', '定制家具', '跟进中', NULL);

-- 插入商机
INSERT INTO crm_opportunity (id, company_id, customer_id, owner_id, name, stage, amount, probability, expected_closed_at) VALUES
(1, 1, 1, 3, '红星美凯龙2026年度合作协议', '商务谈判', 500000.00, 80, '2026-06-30 00:00:00'),
(2, 1, 2, 3, '欧派家居柜柜软件采购', '方案报价', 300000.00, 50, '2026-07-15 00:00:00'),
(3, 1, 3, 4, '索菲亚武汉店CRM系统', '需求确认', 200000.00, 30, '2026-08-01 00:00:00'),
(4, 1, 5, 3, '南京工厂数字化升级项目', '方案报价', 350000.00, 60, '2026-07-01 00:00:00');

-- 插入订单
INSERT INTO crm_order (id, company_id, customer_id, opportunity_id, order_no, amount, status, sign_date) VALUES
(1, 1, 1, 1, 'ORD-2026-0001', 500000.00, '已确认', '2026-05-01 00:00:00'),
(2, 1, 3, 3, 'ORD-2026-0002', 200000.00, '已完成', '2026-04-15 00:00:00');

-- 插入知识库示例
INSERT INTO ai_knowledge_base (id, company_id, category, title, content, tags) VALUES
(1, 1, 'product', '柜柜软件核心功能介绍', '柜柜软件是面向全屋定制工厂的专业板材切割与拆单解决方案，支持CAD图纸导入、自动优化排版、智能拆单、一键排产等功能。', '柜柜软件,拆单,排版'),
(2, 1, 'pricing', '柜柜软件标准报价', '基础版：¥7,980/年；专业版：¥15,800/年；旗舰版：¥29,800/年。支持按需定制功能模块。', '报价,价格'),
(3, 1, 'qa', '常见客户问题-交货期', '标准交货期为15-20个工作日，加急订单可缩短至10个工作日（需额外加收30%加急费）。', '交货期,FAQ'),
(4, 1, 'competitor', '竞品对比-柜柜vs其他拆单软件', '柜柜软件相比传统拆单软件的优势：1）AI智能排料，板材利用率提升5-8%；2）深度定制家具行业适用；3）报价系统和生产管理一体化。', '竞品,对比');
