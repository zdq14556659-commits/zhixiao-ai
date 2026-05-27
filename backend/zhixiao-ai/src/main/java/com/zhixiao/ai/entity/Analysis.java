package com.zhixiao.ai.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * AI Analysis entity mapped to ai_analysis table
 */
@Data
@Entity
@Table(name = "ai_analysis")
public class Analysis {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "company_id", nullable = false)
    private Long companyId;

    @Column(name = "recording_id", nullable = false)
    private Long recordingId;

    @Column(columnDefinition = "TEXT")
    private String summary;

    @Column(length = 100)
    private String intention;

    @Column(name = "intention_confidence", precision = 5, scale = 2)
    private BigDecimal intentionConfidence;

    @Column(name = "customer_emotion", length = 20)
    private String customerEmotion;

    @Column(name = "customer_emotion_score", precision = 5, scale = 2)
    private BigDecimal customerEmotionScore;

    @Column(name = "agent_performance_score", precision = 5, scale = 2)
    private BigDecimal agentPerformanceScore;

    @Column(name = "agent_tips", columnDefinition = "TEXT")
    private String agentTips;

    @Column(name = "key_points", columnDefinition = "TEXT")
    private String keyPoints;

    @Column(name = "action_items", columnDefinition = "TEXT")
    private String actionItems;

    @Column(name = "customer_demand", columnDefinition = "TEXT")
    private String customerDemand;

    @Column(name = "purchase_intent", length = 20)
    private String purchaseIntent;

    @Column(name = "risk_warning", columnDefinition = "TEXT")
    private String riskWarning;

    @Column(name = "model_used", length = 50)
    private String modelUsed;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
