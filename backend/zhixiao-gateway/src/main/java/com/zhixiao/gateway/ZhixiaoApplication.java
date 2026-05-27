package com.zhixiao.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/**
 * 智销AI (Smart Sales AI) - Main Application
 */
@SpringBootApplication
@ComponentScan(basePackages = {
        "com.zhixiao.common",
        "com.zhixiao.auth",
        "com.zhixiao.user",
        "com.zhixiao.customer",
        "com.zhixiao.sales",
        "com.zhixiao.recording",
        "com.zhixiao.asr",
        "com.zhixiao.ai",
        "com.zhixiao.report",
        "com.zhixiao.config",
        "com.zhixiao.gateway"
})
@EntityScan(basePackages = {
        "com.zhixiao.user.entity",
        "com.zhixiao.customer.entity",
        "com.zhixiao.sales.entity",
        "com.zhixiao.recording.entity",
        "com.zhixiao.ai.entity"
})
@EnableJpaRepositories(basePackages = {
        "com.zhixiao.user.repository",
        "com.zhixiao.customer.repository",
        "com.zhixiao.sales.repository",
        "com.zhixiao.recording.repository",
        "com.zhixiao.ai.repository"
})
public class ZhixiaoApplication {

    public static void main(String[] args) {
        SpringApplication.run(ZhixiaoApplication.class, args);
    }
}
