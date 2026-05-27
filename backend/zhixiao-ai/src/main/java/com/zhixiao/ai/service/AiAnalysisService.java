package com.zhixiao.ai.service;

import com.zhixiao.ai.config.AiConfig;
import com.zhixiao.ai.entity.Analysis;
import com.zhixiao.ai.repository.AnalysisRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Random;

/**
 * Simulated AI analysis service
 * Generates mock analysis results using a rule-based approach
 */
@Service
public class AiAnalysisService {

    private static final Logger log = LoggerFactory.getLogger(AiAnalysisService.class);

    @Autowired
    private AiConfig aiConfig;

    @Autowired
    private AnalysisRepository analysisRepository;

    @PersistenceContext
    private EntityManager entityManager;

    private final Random random = new Random();

    /**
     * Execute AI analysis for a recording
     */
    @Transactional
    public Analysis executeAnalysis(Long recordingId) {
        try {
            // Simulate processing delay
            Thread.sleep(aiConfig.getMockDelayMs());

            // Check if recording exists and has transcript
            Object[] recordingInfo = getRecordingInfo(recordingId);
            if (recordingInfo == null) {
                log.warn("Recording not found: {}", recordingId);
                return null;
            }

            String transcribeStatus = (String) recordingInfo[1];
            if (!"completed".equals(transcribeStatus)) {
                log.warn("Recording {} transcription not completed yet, status: {}", recordingId, transcribeStatus);
                return null;
            }

            // Check if analysis already exists
            var existingAnalysis = analysisRepository.findByRecordingId(recordingId);
            if (existingAnalysis.isPresent()) {
                return existingAnalysis.get();
            }

            // Generate mock analysis
            Analysis analysis = generateMockAnalysis(recordingId);
            analysis = analysisRepository.save(analysis);

            // Update recording analyze status
            entityManager.createNativeQuery(
                    "UPDATE rec_recording SET analyze_status = 'completed' WHERE id = :id")
                    .setParameter("id", recordingId)
                    .executeUpdate();

            log.info("Mock AI analysis completed for recording: {}", recordingId);
            return analysis;

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }

    /**
     * Get analysis by ID
     */
    public Analysis findById(Long id) {
        return analysisRepository.findById(id).orElse(null);
    }

    /**
     * Get analysis by recording ID
     */
    public Analysis findByRecordingId(Long recordingId) {
        return analysisRepository.findByRecordingId(recordingId).orElse(null);
    }

    private Object[] getRecordingInfo(Long recordingId) {
        try {
            return (Object[]) entityManager.createNativeQuery(
                    "SELECT id, transcribe_status, transcribe_text FROM rec_recording WHERE id = :id")
                    .setParameter("id", recordingId)
                    .getSingleResult();
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Generate mock analysis results
     */
    private Analysis generateMockAnalysis(Long recordingId) {
        Analysis analysis = new Analysis();
        analysis.setCompanyId(1L);
        analysis.setRecordingId(recordingId);

        // Generate mock summary
        analysis.setSummary(generateMockSummary());

        // Generate mock intention
        String[] intentions = {"询价", "产品咨询", "投诉处理", "售后服务", "合作洽谈", "其他"};
        String[] purchaseIntents = {"high", "mid", "low", "unknown"};
        String[] emotions = {"positive", "negative", "angry", "hesitant", "neutral"};

        analysis.setIntention(intentions[random.nextInt(intentions.length)]);
        analysis.setIntentionConfidence(BigDecimal.valueOf(0.75 + random.nextDouble() * 0.2));
        analysis.setCustomerEmotion(emotions[random.nextInt(emotions.length)]);
        analysis.setCustomerEmotionScore(BigDecimal.valueOf(random.nextDouble() * 100));
        analysis.setAgentPerformanceScore(BigDecimal.valueOf(60 + random.nextDouble() * 40));
        analysis.setPurchaseIntent(purchaseIntents[random.nextInt(purchaseIntents.length)]);

        // Generate mock tips based on score
        double score = analysis.getAgentPerformanceScore().doubleValue();
        if (score < 70) {
            analysis.setAgentTips("建议加强产品知识学习，提高沟通技巧。多关注客户需求，避免过度推销。");
        } else if (score < 85) {
            analysis.setAgentTips("整体表现良好，建议在客户异议处理方面进一步提升。适当增加产品价值传递。");
        } else {
            analysis.setAgentTips("表现优秀！请继续保持。建议分享成功经验给团队成员。");
        }

        // Generate mock key points
        analysis.setKeyPoints(generateMockKeyPoints());

        // Generate mock action items
        analysis.setActionItems(generateMockActionItems());

        // Generate mock customer demand
        analysis.setCustomerDemand(generateMockDemand());

        // Generate mock risk warning
        if (random.nextBoolean()) {
            analysis.setRiskWarning("客户对价格较为敏感，建议关注竞品动态，提供有竞争力的报价方案。");
        } else {
            analysis.setRiskWarning("无明显风险，客户意向较为明确，建议加快跟进节奏。");
        }

        analysis.setModelUsed(aiConfig.getModelName());

        return analysis;
    }

    private String generateMockSummary() {
        String[] summaries = {
                "客户通过电话咨询了我司的智能销售系统产品，对功能模块和价格体系进行了详细了解。客服人员专业地回答了客户的问题，并针对客户的需求推荐了合适的版本。客户表示会考虑购买，双方约定后续进一步沟通。",
                "客户来电投诉系统使用中遇到的问题，客服人员耐心听取了客户的意见并表达了歉意。针对客户提出的功能问题，客服承诺会在24小时内安排技术团队跟进解决。同时为客户申请了延长试用期的补偿方案，客户情绪得到缓解。",
                "这是一通关于产品报价的沟通电话。客户对比了几家供应商的产品和价格，我司客服详细介绍了产品的差异化优势和售后服务保障。客户对我司的专业度表示认可，但还需要时间进行内部评估。"
        };
        return summaries[random.nextInt(summaries.length)];
    }

    private String generateMockKeyPoints() {
        return "1. 客户关注产品价格和功能\n2. 客户希望了解售后服务保障\n3. 客户提到了竞品信息\n4. 客户有明确的使用场景\n5. 客服提供了针对性的解决方案";
    }

    private String generateMockActionItems() {
        return "1. 整理产品资料发送给客户\n2. 安排产品演示\n3. 提供定制化报价方案\n4. 三天后进行跟进回访";
    }

    private String generateMockDemand() {
        String[] demands = {
                "客户需要一套能够整合客户管理、销售跟进和数据分析的智能销售平台，特别关注录音分析功能。",
                "客户希望优化现有的客户管理流程，提高销售团队的工作效率，对AI智能分析功能有明确需求。",
                "客户主要关注系统的稳定性和售后服务支持，需要能够快速响应的技术支持团队。"
        };
        return demands[random.nextInt(demands.length)];
    }
}
