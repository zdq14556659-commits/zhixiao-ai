package com.zhixiao.asr.controller;

import com.zhixiao.asr.service.AsrService;
import com.zhixiao.common.response.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * ASR transcription controller
 */
@RestController
@RequestMapping("/api/asr")
public class AsrController {

    @Autowired
    private AsrService asrService;

    /**
     * Start transcription for a recording
     */
    @PostMapping("/transcribe/{recordingId}")
    public Result<Map<String, Object>> transcribe(@PathVariable Long recordingId) {
        String status = asrService.startTranscription(recordingId);

        // Execute transcription synchronously (in a real system this would be async via RabbitMQ)
        CompletableFuture.runAsync(() -> asrService.executeTranscription(recordingId));

        return Result.success(Map.of(
                "recordingId", recordingId,
                "status", status,
                "message", "Transcription started"
        ));
    }

    /**
     * Get transcription status
     */
    @GetMapping("/status/{recordingId}")
    public Result<Map<String, Object>> getStatus(@PathVariable Long recordingId) {
        String status = asrService.getTranscriptionStatus(recordingId);
        return Result.success(Map.of(
                "recordingId", recordingId,
                "status", status
        ));
    }
}
