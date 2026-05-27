package com.zhixiao.asr.service;

import com.zhixiao.asr.config.AsrConfig;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Simulated ASR transcription service
 * Generates mock transcripts since no real ASR API keys are available
 */
@Service
public class AsrService {

    private static final Logger log = LoggerFactory.getLogger(AsrService.class);

    @Autowired
    private AsrConfig asrConfig;

    @PersistenceContext
    private EntityManager entityManager;

    private final Map<Long, String> taskStatusMap = new ConcurrentHashMap<>();

    // Mock conversation templates for different scenarios
    private static final List<List<String>> MOCK_CONVERSATIONS = Arrays.asList(
            // Scenario 1: Product inquiry
            Arrays.asList(
                    "你好，我想咨询一下你们的产品信息。",
                    "您好！感谢您的来电。请问您想了解哪方面的产品呢？",
                    "我听说你们有一款智能销售系统，能介绍一下吗？",
                    "是的，我们的智销AI系统是一套完整的智能销售解决方案，包括客户管理、销售漏斗、录音分析等功能。",
                    "那价格方面是怎么样的？",
                    "我们提供多种版本，基础版每年9800元，专业版19800元，支持按需定制。",
                    "好的，我了解一下，回头联系你。",
                    "好的，方便加一下微信吗？我稍后把详细资料发给您。"
            ),
            // Scenario 2: After-sales support
            Arrays.asList(
                    "你好，我这边系统有点问题想咨询一下。",
                    "您好，请问您遇到了什么问题呢？",
                    "我们昨天上传的录音文件一直显示转写中，已经等了好几个小时了。",
                    "您方便提供一下录音的编号吗？我帮您查一下。",
                    "编号是REC20260521001。",
                    "好的，我查到了。这是今天上传的，文件比较大，转写可能需要一些时间。我帮您催一下处理进度。",
                    "大概还需要多久呢？",
                    "预计还需要30分钟左右，处理完成后系统会自动通知您的。"
            ),
            // Scenario 3: Complaint call
            Arrays.asList(
                    "我要投诉！你们的产品太差了！",
                    "非常抱歉给您带来不好的体验，请问您具体遇到了什么问题？",
                    "我们买了专业版，但很多功能都用不了，客服也不回消息。",
                    "我理解您的心情。您方便告诉我具体是哪几个功能无法使用吗？我马上帮您核实处理。",
                    "数据分析功能一直报错，客户导入也失败。",
                    "这两个问题我立刻反馈给技术团队，今天内给您答复。同时我会为您申请一个月的免费延期作为补偿，您看可以吗？",
                    "那行吧，尽快帮我处理。",
                    "好的，感谢您的理解，我们会尽快处理并联系您。"
            )
    );

    /**
     * Start transcription for a recording (async simulation)
     */
    public String startTranscription(Long recordingId) {
        taskStatusMap.put(recordingId, "processing");
        log.info("Started mock ASR transcription for recording: {}", recordingId);

        // Update recording status to processing
        entityManager.createNativeQuery(
                "UPDATE rec_recording SET transcribe_status = 'processing' WHERE id = :id")
                .setParameter("id", recordingId)
                .executeUpdate();

        // In a real system, this would be async. Here we'll process synchronously in the controller.
        return "processing";
    }

    /**
     * Execute simulated transcription (called synchronously)
     */
    @Transactional
    public void executeTranscription(Long recordingId) {
        try {
            // Simulate processing delay
            Thread.sleep(asrConfig.getMockDelayMs());

            RecordingInfo recordingInfo = getRecordingInfo(recordingId);
            if (recordingInfo == null) {
                taskStatusMap.put(recordingId, "failed");
                return;
            }

            int duration = recordingInfo.duration > 0 ? recordingInfo.duration : 120;

            // Generate mock segments
            List<Object[]> segments = generateMockSegments(recordingId, duration);
            StringBuilder fullText = new StringBuilder();

            // Save segments
            int seq = 0;
            for (Object[] segment : segments) {
                entityManager.createNativeQuery(
                        "INSERT INTO rec_segment (recording_id, speaker, content, start_time, end_time, seq) " +
                                "VALUES (:recordingId, :speaker, :content, :startTime, :endTime, :seq)")
                        .setParameter("recordingId", recordingId)
                        .setParameter("speaker", segment[0])
                        .setParameter("content", segment[1])
                        .setParameter("startTime", segment[2])
                        .setParameter("endTime", segment[3])
                        .setParameter("seq", ++seq)
                        .executeUpdate();

                if (fullText.length() > 0) fullText.append("\n");
                fullText.append("[").append(segment[0]).append("] ").append(segment[1]);
            }

            // Update recording status
            entityManager.createNativeQuery(
                    "UPDATE rec_recording SET transcribe_status = 'completed', transcribe_text = :text, " +
                            "transcribe_at = :transcribeAt WHERE id = :id")
                    .setParameter("text", fullText.toString())
                    .setParameter("transcribeAt", LocalDateTime.now())
                    .setParameter("id", recordingId)
                    .executeUpdate();

            taskStatusMap.put(recordingId, "completed");
            log.info("Mock ASR transcription completed for recording: {}", recordingId);

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            taskStatusMap.put(recordingId, "failed");
            entityManager.createNativeQuery(
                    "UPDATE rec_recording SET transcribe_status = 'failed' WHERE id = :id")
                    .setParameter("id", recordingId)
                    .executeUpdate();
        } catch (Exception e) {
            log.error("Mock ASR transcription failed for recording: {}", recordingId, e);
            taskStatusMap.put(recordingId, "failed");
            entityManager.createNativeQuery(
                    "UPDATE rec_recording SET transcribe_status = 'failed' WHERE id = :id")
                    .setParameter("id", recordingId)
                    .executeUpdate();
        }
    }

    /**
     * Get transcription status
     */
    public String getTranscriptionStatus(Long recordingId) {
        return taskStatusMap.getOrDefault(recordingId, "unknown");
    }

    private RecordingInfo getRecordingInfo(Long recordingId) {
        try {
            Object[] result = (Object[]) entityManager.createNativeQuery(
                    "SELECT id, duration FROM rec_recording WHERE id = :id")
                    .setParameter("id", recordingId)
                    .getSingleResult();
            RecordingInfo info = new RecordingInfo();
            info.id = ((Number) result[0]).longValue();
            info.duration = result[1] != null ? ((Number) result[1]).intValue() : 0;
            return info;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Generate mock conversation segments
     */
    private List<Object[]> generateMockSegments(Long recordingId, int durationSeconds) {
        List<Object[]> segments = new ArrayList<>();

        // Pick a random conversation template
        List<String> conversation = MOCK_CONVERSATIONS.get(
                Math.abs(new Random().nextInt()) % MOCK_CONVERSATIONS.size());

        int totalLines = conversation.size();
        int avgSegmentDuration = durationSeconds * 1000 / totalLines;

        int currentTime = 0;
        for (int i = 0; i < totalLines; i++) {
            String speaker = (i % 2 == 0) ? "customer" : "agent";
            int startTime = currentTime;
            int duration = avgSegmentDuration + (int) (Math.random() * 2000 - 1000);
            int endTime = startTime + Math.max(duration, 1000);
            currentTime = endTime;

            segments.add(new Object[]{
                    speaker,
                    conversation.get(i % conversation.size()),
                    startTime,
                    endTime
            });
        }

        return segments;
    }

    private static class RecordingInfo {
        Long id;
        int duration;
    }
}
