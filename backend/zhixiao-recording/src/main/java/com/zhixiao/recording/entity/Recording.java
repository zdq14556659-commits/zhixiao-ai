package com.zhixiao.recording.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * Recording entity mapped to rec_recording table
 */
@Data
@Entity
@Table(name = "rec_recording")
public class Recording {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "company_id", nullable = false)
    private Long companyId;

    @Column(name = "customer_id")
    private Long customerId;

    @Column(name = "opportunity_id")
    private Long opportunityId;

    @Column(name = "owner_id")
    private Long ownerId;

    @Column(name = "file_name", nullable = false, length = 255)
    private String fileName;

    @Column(name = "file_path", nullable = false, length = 500)
    private String filePath;

    @Column(name = "file_size")
    private Long fileSize = 0L;

    @Column(nullable = false)
    private Integer duration = 0;

    @Column(name = "call_type", length = 20)
    private String callType = "phone";

    @Column(name = "caller_number", length = 20)
    private String callerNumber;

    @Column(name = "callee_number", length = 20)
    private String calleeNumber;

    @Column(name = "call_direction", length = 10)
    private String callDirection;

    @Column(name = "call_time")
    private LocalDateTime callTime;

    @Column(name = "transcribe_status", length = 20)
    private String transcribeStatus = "pending";

    @Column(name = "transcribe_text", columnDefinition = "LONGTEXT")
    private String transcribeText;

    @Column(name = "transcribe_at")
    private LocalDateTime transcribeAt;

    @Column(name = "analyze_status", length = 20)
    private String analyzeStatus = "pending";

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
