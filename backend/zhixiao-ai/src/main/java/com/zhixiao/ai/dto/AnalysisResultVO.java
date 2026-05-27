package com.zhixiao.ai.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * AI analysis result VO
 */
@Data
public class AnalysisResultVO {

    private Long analysisId;
    private Long recordingId;
    private String summary;
    private String intention;
    private BigDecimal intentionConfidence;
    private String customerEmotion;
    private BigDecimal customerEmotionScore;
    private BigDecimal agentPerformanceScore;
    private String agentTips;
    private String keyPoints;
    private String actionItems;
    private String customerDemand;
    private String purchaseIntent;
    private String riskWarning;
    private String modelUsed;
}
