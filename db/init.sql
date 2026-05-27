-- ============================================
-- 智销AI - 数据库初始化脚本
-- 版本: V1.0
-- ============================================

CREATE DATABASE IF NOT EXISTS zhixiao_ai DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE zhixiao_ai;

-- ============================================
-- 1. 系统基础表
-- ============================================

-- 公司/租户表
CREATE TABLE sys_company (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    name VARCHAR(100) NOT NULL COMMENT '公司名称',
    code VARCHAR(50) UNIQUE COMMENT '公司编码',
    contact_name VARCHAR(50) COMMENT '联系人',
    contact_phone VARCHAR(20) COMMENT '联系电话',
    address VARCHAR(200) COMMENT '公司地址',
    industry VARCHAR(50) COMMENT '所属行业',
    member_count INT DEFAULT 0 COMMENT '成员数量',
    expire_date DATETIME COMMENT '有效期',
    status TINYINT DEFAULT 1 COMMENT '状态: 0=禁用 1=启用',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    is_deleted TINYINT DEFAULT 0 COMMENT '逻辑删除: 0=未删 1=已删'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公司/租户表';

-- 用户表
CREATE TABLE sys_user (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    company_id BIGINT NOT NULL COMMENT '所属公司ID',
    username VARCHAR(50) NOT NULL COMMENT '登录账号',
    password VARCHAR(255) NOT NULL COMMENT '加密密码',
    real_name VARCHAR(50) COMMENT '真实姓名',
    phone VARCHAR(20) COMMENT '手机号',
    email VARCHAR(100) COMMENT '邮箱',
    avatar VARCHAR(255) COMMENT '头像URL',
    job_title VARCHAR(50) COMMENT '职位',
    department VARCHAR(50) COMMENT '部门',
    status TINYINT DEFAULT 1 COMMENT '状态: 0=禁用 1=启用',
    last_login_at DATETIME COMMENT '最后登录时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    is_deleted TINYINT DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_company_username (company_id, username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统用户表';

-- 角色表
CREATE TABLE sys_role (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    company_id BIGINT NOT NULL COMMENT '公司ID',
    name VARCHAR(50) NOT NULL COMMENT '角色名称',
    code VARCHAR(50) NOT NULL COMMENT '角色编码',
    description VARCHAR(200) COMMENT '角色描述',
    status TINYINT DEFAULT 1 COMMENT '状态',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT DEFAULT 0,
    UNIQUE KEY uk_company_code (company_id, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表';

-- 用户角色关联表
CREATE TABLE sys_user_role (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_role (user_id, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户角色关联表';

-- 权限表
CREATE TABLE sys_permission (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    parent_id BIGINT DEFAULT 0 COMMENT '父权限ID',
    name VARCHAR(100) NOT NULL COMMENT '权限名称',
    code VARCHAR(100) NOT NULL COMMENT '权限编码',
    type TINYINT DEFAULT 1 COMMENT '类型: 1=菜单 2=按钮 3=API',
    path VARCHAR(200) COMMENT '路由路径',
    icon VARCHAR(50) COMMENT '图标',
    sort_order INT DEFAULT 0 COMMENT '排序',
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_deleted TINYINT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权限表';

-- 角色权限关联表
CREATE TABLE sys_role_permission (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    role_id BIGINT NOT NULL,
    permission_id BIGINT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_role_permission (role_id, permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色权限关联表';

-- ============================================
-- 2. CRM客户管理表
-- ============================================

-- 客户表
CREATE TABLE crm_customer (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    company_id BIGINT NOT NULL COMMENT '公司ID',
    owner_id BIGINT COMMENT '负责人ID',
    name VARCHAR(100) NOT NULL COMMENT '客户名称（公司名）',
    industry VARCHAR(50) COMMENT '所属行业',
    source VARCHAR(30) COMMENT '客户来源: 自拓/转介绍/网络/展会/其他',
    phone VARCHAR(20) COMMENT '联系电话',
    address VARCHAR(200) COMMENT '地址',
    website VARCHAR(200) COMMENT '网址',
    stage VARCHAR(30) DEFAULT '潜在客户' COMMENT '客户阶段: 潜在客户/意向客户/谈判中/已成交/流失',
    tags VARCHAR(200) COMMENT '标签（逗号分隔）',
    intention_level TINYINT DEFAULT 0 COMMENT '意向等级: 0=未评定 1-5星',
    estimated_amount DECIMAL(15,2) COMMENT '预估金额',
    next_contact_at DATETIME COMMENT '下次联系时间',
    remark TEXT COMMENT '备注',
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT DEFAULT 0,
    INDEX idx_company_owner (company_id, owner_id),
    INDEX idx_stage (stage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户表';

-- 联系人表
CREATE TABLE crm_contact (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    customer_id BIGINT NOT NULL COMMENT '所属客户ID',
    name VARCHAR(50) NOT NULL COMMENT '联系人姓名',
    phone VARCHAR(20) COMMENT '电话',
    position VARCHAR(50) COMMENT '职位',
    is_decision_maker TINYINT DEFAULT 0 COMMENT '是否决策人: 0=否 1=是',
    wechat_id VARCHAR(50) COMMENT '微信号',
    email VARCHAR(100) COMMENT '邮箱',
    remark TEXT COMMENT '备注',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT DEFAULT 0,
    INDEX idx_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='联系人表';

-- 线索表
CREATE TABLE crm_clue (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    company_id BIGINT NOT NULL,
    owner_id BIGINT COMMENT '领取人ID',
    customer_name VARCHAR(100) COMMENT '客户名称',
    contact_name VARCHAR(50) COMMENT '联系人',
    contact_phone VARCHAR(20) COMMENT '联系电话',
    source VARCHAR(30) COMMENT '线索来源',
    industry VARCHAR(50) COMMENT '行业',
    description TEXT COMMENT '线索描述',
    status VARCHAR(30) DEFAULT '待分配' COMMENT '状态: 待分配/跟进中/已转化/已废弃',
    converted_customer_id BIGINT COMMENT '转化后的客户ID',
    assigned_at DATETIME COMMENT '分配时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT DEFAULT 0,
    INDEX idx_company_status (company_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='线索表';

-- ============================================
-- 3. 销售漏斗表
-- ============================================

-- 商机表
CREATE TABLE crm_opportunity (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    company_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL COMMENT '关联客户ID',
    owner_id BIGINT COMMENT '负责人ID',
    name VARCHAR(200) NOT NULL COMMENT '商机名称',
    stage VARCHAR(30) NOT NULL COMMENT '阶段: 需求确认/方案报价/商务谈判/赢单/输单',
    amount DECIMAL(15,2) DEFAULT 0 COMMENT '预计金额',
    probability TINYINT DEFAULT 0 COMMENT '赢单概率(%)',
    expected_closed_at DATETIME COMMENT '预计成交日期',
    competitor VARCHAR(100) COMMENT '竞争对手',
    reason TEXT COMMENT '备注/原因',
    win_reason TEXT COMMENT '赢单原因',
    lose_reason TEXT COMMENT '输单原因',
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT DEFAULT 0,
    INDEX idx_company_stage (company_id, stage),
    INDEX idx_customer (customer_id),
    INDEX idx_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商机表';

-- 商机阶段变更记录
CREATE TABLE crm_opportunity_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    opportunity_id BIGINT NOT NULL,
    from_stage VARCHAR(30) COMMENT '原阶段',
    to_stage VARCHAR(30) NOT NULL COMMENT '新阶段',
    operator_id BIGINT COMMENT '操作人',
    remark TEXT COMMENT '备注',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_opportunity (opportunity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商机变更记录表';

-- 订单表
CREATE TABLE crm_order (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    company_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,
    opportunity_id BIGINT COMMENT '关联商机ID',
    order_no VARCHAR(50) NOT NULL COMMENT '订单编号',
    amount DECIMAL(15,2) NOT NULL COMMENT '订单金额',
    status VARCHAR(30) DEFAULT '待确认' COMMENT '状态: 待确认/已确认/生产中/已发货/已完成/已取消',
    sign_date DATETIME COMMENT '签单日期',
    delivery_date DATETIME COMMENT '交付日期',
    remark TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT DEFAULT 0,
    UNIQUE KEY uk_order_no (order_no),
    INDEX idx_company (company_id),
    INDEX idx_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单表';

-- ============================================
-- 4. 录音与转写表
-- ============================================

-- 录音记录表
CREATE TABLE rec_recording (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    company_id BIGINT NOT NULL,
    customer_id BIGINT COMMENT '关联客户ID',
    opportunity_id BIGINT COMMENT '关联商机ID',
    owner_id BIGINT COMMENT '录音者ID',
    file_name VARCHAR(255) NOT NULL COMMENT '原始文件名',
    file_path VARCHAR(500) NOT NULL COMMENT '存储路径',
    file_size BIGINT DEFAULT 0 COMMENT '文件大小(字节)',
    duration INT DEFAULT 0 COMMENT '录音时长(秒)',
    call_type VARCHAR(20) DEFAULT 'phone' COMMENT '类型: phone=电话, wechat=微信语音, meeting=面谈',
    caller_number VARCHAR(20) COMMENT '主叫号码',
    callee_number VARCHAR(20) COMMENT '被叫号码',
    call_direction VARCHAR(10) COMMENT '方向: inbound/outbound',
    call_time DATETIME COMMENT '通话时间',
    transcribe_status VARCHAR(20) DEFAULT 'pending' COMMENT '转写状态: pending/processing/completed/failed',
    transcribe_text LONGTEXT COMMENT '转写文本',
    transcribe_at DATETIME COMMENT '转写完成时间',
    analyze_status VARCHAR(20) DEFAULT 'pending' COMMENT '分析状态: pending/completed/failed',
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT DEFAULT 0,
    INDEX idx_company_owner (company_id, owner_id),
    INDEX idx_customer (customer_id),
    INDEX idx_transcribe_status (transcribe_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='录音记录表';

-- 转写分段表（带话者分离）
CREATE TABLE rec_segment (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    recording_id BIGINT NOT NULL COMMENT '录音ID',
    speaker VARCHAR(20) NOT NULL COMMENT '说话人: agent/staff/customer/unknown',
    content TEXT NOT NULL COMMENT '说话内容',
    start_time INT COMMENT '开始时间(毫秒)',
    end_time INT COMMENT '结束时间(毫秒)',
    seq INT COMMENT '说话顺序',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_recording (recording_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='转写分段表';

-- ============================================
-- 5. AI分析表
-- ============================================

-- AI分析结果表
CREATE TABLE ai_analysis (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    company_id BIGINT NOT NULL,
    recording_id BIGINT NOT NULL COMMENT '关联录音ID',
    summary TEXT COMMENT 'AI生成的沟通摘要',
    intention VARCHAR(100) COMMENT '客户意图: 询价/对比/投诉/售后/合作/其他',
    intention_confidence DECIMAL(5,2) COMMENT '意图置信度',
    customer_emotion VARCHAR(20) COMMENT '客户情绪: positive/negative/angry/hesitant/neutral',
    customer_emotion_score DECIMAL(5,2) COMMENT '情绪得分',
    agent_performance_score DECIMAL(5,2) COMMENT '话术评分',
    agent_tips TEXT COMMENT '改进建议',
    key_points TEXT COMMENT '关键要点提取',
    action_items TEXT COMMENT '待办事项',
    customer_demand TEXT COMMENT '客户需求识别',
    purchase_intent VARCHAR(20) COMMENT '购买意向: high/mid/low/unknown',
    risk_warning TEXT COMMENT '风险预警',
    model_used VARCHAR(50) COMMENT '使用的模型',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_recording (recording_id),
    INDEX idx_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI分析结果表';

-- 知识库表
CREATE TABLE ai_knowledge_base (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    company_id BIGINT NOT NULL,
    category VARCHAR(50) NOT NULL COMMENT '分类: product/pricing/competitor/qa/process',
    title VARCHAR(200) NOT NULL COMMENT '标题',
    content TEXT NOT NULL COMMENT '内容',
    tags VARCHAR(200) COMMENT '标签',
    is_published TINYINT DEFAULT 1,
    created_by BIGINT COMMENT '创建人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT DEFAULT 0,
    INDEX idx_company_category (company_id, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识库表';

-- ============================================
-- 6. 沟通记录表
-- ============================================

-- 沟通记录表
CREATE TABLE crm_communication (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    company_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL COMMENT '客户ID',
    owner_id BIGINT COMMENT '跟进人ID',
    comm_type VARCHAR(20) NOT NULL COMMENT '类型: phone/wechat/meeting/email/visit/other',
    subject VARCHAR(200) COMMENT '沟通主题',
    content TEXT COMMENT '沟通内容',
    recording_id BIGINT COMMENT '关联录音ID',
    comm_time DATETIME COMMENT '沟通时间',
    next_action TEXT COMMENT '下一步行动',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_customer (customer_id),
    INDEX idx_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='沟通记录表';

-- ============================================
-- 7. 系统日志表
-- ============================================

CREATE TABLE sys_operation_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    company_id BIGINT,
    user_id BIGINT COMMENT '操作人ID',
    module VARCHAR(50) COMMENT '操作模块',
    action VARCHAR(50) COMMENT '操作动作',
    target_id BIGINT COMMENT '操作对象ID',
    detail TEXT COMMENT '操作详情',
    ip VARCHAR(50) COMMENT 'IP地址',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_company (company_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作日志表';
