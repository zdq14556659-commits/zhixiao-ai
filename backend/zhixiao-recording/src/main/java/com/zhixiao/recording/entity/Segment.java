package com.zhixiao.recording.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * Recording segment entity mapped to rec_segment table
 */
@Data
@Entity
@Table(name = "rec_segment")
public class Segment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "recording_id", nullable = false)
    private Long recordingId;

    @Column(nullable = false, length = 20)
    private String speaker;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "start_time")
    private Integer startTime;

    @Column(name = "end_time")
    private Integer endTime;

    @Column(name = "seq")
    private Integer seq;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
