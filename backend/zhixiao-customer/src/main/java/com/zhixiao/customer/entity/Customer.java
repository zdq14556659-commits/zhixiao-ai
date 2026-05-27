package com.zhixiao.customer.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Customer entity mapped to crm_customer table
 */
@Data
@Entity
@Table(name = "crm_customer")
public class Customer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "company_id", nullable = false)
    private Long companyId;

    @Column(name = "owner_id")
    private Long ownerId;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 50)
    private String industry;

    @Column(length = 30)
    private String source;

    @Column(length = 20)
    private String phone;

    @Column(length = 200)
    private String address;

    @Column(length = 200)
    private String website;

    @Column(length = 30)
    private String stage = "潜在客户";

    @Column(length = 200)
    private String tags;

    @Column(name = "intention_level")
    private Integer intentionLevel = 0;

    @Column(name = "estimated_amount", precision = 15, scale = 2)
    private BigDecimal estimatedAmount;

    @Column(name = "next_contact_at")
    private LocalDateTime nextContactAt;

    @Column(columnDefinition = "TEXT")
    private String remark;

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
