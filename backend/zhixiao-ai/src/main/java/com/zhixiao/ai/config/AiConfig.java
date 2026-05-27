package com.zhixiao.ai.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * AI analysis configuration
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "ai")
public class AiConfig {

    /**
     * Whether to use mock mode
     */
    private boolean mock = true;

    /**
     * Mock analysis delay in milliseconds
     */
    private long mockDelayMs = 3000;

    /**
     * Model name for mock analysis
     */
    private String modelName = "zhixiao-ai-mock-v1";
}
