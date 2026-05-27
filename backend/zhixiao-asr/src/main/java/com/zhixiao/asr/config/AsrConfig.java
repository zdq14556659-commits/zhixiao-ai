package com.zhixiao.asr.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * ASR configuration properties
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "asr")
public class AsrConfig {

    /**
     * Mock ASR delay in milliseconds
     */
    private long mockDelayMs = 2000;

    /**
     * Whether to use mock mode
     */
    private boolean mock = true;
}
