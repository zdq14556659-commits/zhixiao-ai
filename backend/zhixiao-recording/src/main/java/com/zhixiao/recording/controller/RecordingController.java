package com.zhixiao.recording.controller;

import com.zhixiao.common.response.PageResult;
import com.zhixiao.common.response.Result;
import com.zhixiao.recording.dto.RecordingUploadRequest;
import com.zhixiao.recording.entity.Recording;
import com.zhixiao.recording.entity.Segment;
import com.zhixiao.recording.service.RecordingService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * Recording controller
 */
@RestController
@RequestMapping("/api/recordings")
public class RecordingController {

    @Autowired
    private RecordingService recordingService;

    /**
     * Upload recording file
     */
    @PostMapping("/upload")
    public Result<Recording> uploadRecording(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "customerId", required = false) Long customerId,
            @RequestParam(value = "opportunityId", required = false) Long opportunityId,
            @RequestParam(value = "callType", defaultValue = "phone") String callType,
            @RequestParam(value = "duration", required = false) Integer duration,
            @RequestAttribute("userId") Long userId) {
        Recording recording = recordingService.uploadRecording(
                file, 1L, userId, customerId, opportunityId, callType, duration);
        return Result.created(recording);
    }

    /**
     * List recordings
     */
    @GetMapping
    public PageResult<Recording> listRecordings(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int pageSize) {
        Page<Recording> recordingPage = recordingService.listRecordings(1L, PageRequest.of(page - 1, pageSize));
        return PageResult.success(recordingPage.getContent(), recordingPage.getTotalElements(), page, pageSize);
    }

    /**
     * Get recording by ID
     */
    @GetMapping("/{id}")
    public Result<Recording> getRecording(@PathVariable Long id) {
        return Result.success(recordingService.findById(id));
    }

    /**
     * Get recording transcript (segments)
     */
    @GetMapping("/{id}/transcript")
    public Result<List<Segment>> getTranscript(@PathVariable Long id) {
        return Result.success(recordingService.getTranscript(id));
    }

    /**
     * Delete recording
     */
    @DeleteMapping("/{id}")
    public Result<Void> deleteRecording(@PathVariable Long id) {
        recordingService.deleteRecording(id);
        return Result.success();
    }
}
