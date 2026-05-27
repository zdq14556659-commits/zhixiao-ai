package com.zhixiao.ai.controller;

import com.zhixiao.ai.dto.AnalysisResultVO;
import com.zhixiao.ai.entity.Analysis;
import com.zhixiao.ai.service.AiAnalysisService;
import com.zhixiao.common.response.Result;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.concurrent.CompletableFuture;

/**
 * AI analysis controller
 */
@RestController
@RequestMapping("/api/ai")
public class AiController {

    @Autowired
    private AiAnalysisService aiAnalysisService;

    /**
     * Trigger AI analysis for a recording
     */
    @PostMapping("/analyze/{recordingId}")
    public Result<String> analyze(@PathVariable Long recordingId) {
        CompletableFuture.runAsync(() -> aiAnalysisService.executeAnalysis(recordingId));
        return Result.success("AI analysis started for recording: " + recordingId);
    }

    /**
     * Get analysis result by ID
     */
    @GetMapping("/analysis/{id}")
    public Result<AnalysisResultVO> getAnalysis(@PathVariable Long id) {
        Analysis analysis = aiAnalysisService.findById(id);
        if (analysis == null) {
            return Result.notFound("Analysis not found: " + id);
        }
        return Result.success(toVO(analysis));
    }

    /**
     * Get analysis result by recording ID
     */
    @GetMapping("/recording/{recordingId}")
    public Result<AnalysisResultVO> getAnalysisByRecording(@PathVariable Long recordingId) {
        Analysis analysis = aiAnalysisService.findByRecordingId(recordingId);
        if (analysis == null) {
            return Result.notFound("Analysis not found for recording: " + recordingId);
        }
        return Result.success(toVO(analysis));
    }

    private AnalysisResultVO toVO(Analysis analysis) {
        AnalysisResultVO vo = new AnalysisResultVO();
        BeanUtils.copyProperties(analysis, vo);
        vo.setAnalysisId(analysis.getId());
        return vo;
    }
}
