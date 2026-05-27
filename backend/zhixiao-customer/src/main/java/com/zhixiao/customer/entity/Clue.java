package com.zhixiao.customer.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * Clue entity mapped to crm_clue table
 */
@Data
@Entity
@Table(name = "crm_clue")
public class Clue {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "company_id", nullable = false)
    private Long companyId;

    @Column(name = "owner_id")
    private Long ownerId;

    @Column(name = "customer_name", length = 100)
    private String customerName;

    @Column(name = "contact_name", length = 50)
    private String contactName;

    @Column(name = "contact_phone", length = 20)
    private String contactPhone;

    @Column(length = 30)
    private String source;

    @Column(length = 50)
    private String industry;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(length = 30)
    private String status = "待分配";

    @Column(name = "converted_customer_id")
    private Long convertedCustomerId;

    @Column(name = "assigned_at")
    private LocalDateTime assignedAt;

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
