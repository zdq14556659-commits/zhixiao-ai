package com.zhixiao.sales.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Opportunity entity mapped to crm_opportunity table
 */
@Data
@Entity
@Table(name = "crm_opportunity")
public class Opportunity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "company_id", nullable = false)
    private Long companyId;

    @Column(name = "customer_id", nullable = false)
    private Long customerId;

    @Column(name = "owner_id")
    private Long ownerId;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(nullable = false, length = 30)
    private String stage;

    @Column(precision = 15, scale = 2)
    private BigDecimal amount = BigDecimal.ZERO;

    private Integer probability = 0;

    @Column(name = "expected_closed_at")
    private LocalDateTime expectedClosedAt;

    @Column(length = 100)
    private String competitor;

    @Column(columnDefinition = "TEXT")
    private String reason;

    @Column(name = "win_reason", columnDefinition = "TEXT")
    private String winReason;

    @Column(name = "lose_reason", columnDefinition = "TEXT")
    private String loseReason;

    @Column(nullable = false)
    private Integer status = 1;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "is_deleted")
    private Integer isDeleted = 0;

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
