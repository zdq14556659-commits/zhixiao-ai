package com.zhixiao.sales.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * Opportunity stage change log entity mapped to crm_opportunity_log table
 */
@Data
@Entity
@Table(name = "crm_opportunity_log")
public class OpportunityLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "opportunity_id", nullable = false)
    private Long opportunityId;

    @Column(name = "from_stage", length = 30)
    private String fromStage;

    @Column(name = "to_stage", nullable = false, length = 30)
    private String toStage;

    @Column(name = "operator_id")
    private Long operatorId;

    @Column(columnDefinition = "TEXT")
    private String remark;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
