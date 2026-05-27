package com.zhixiao.recording.dto;

import lombok.Data;

/**
 * Recording upload request DTO
 */
@Data
public class RecordingUploadRequest {

    private Long customerId;
    private Long opportunityId;
    private String callType = "phone";
    private String callerNumber;
    private String calleeNumber;
    private String callDirection;
    private String callTime;
    private Integer duration;
}
