package com.zhixiao.recording.service;

import com.zhixiao.common.exception.BusinessException;
import com.zhixiao.config.MinioConfig;
import com.zhixiao.recording.entity.Recording;
import com.zhixiao.recording.entity.Segment;
import com.zhixiao.recording.repository.RecordingRepository;
import com.zhixiao.recording.repository.SegmentRepository;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Recording service
 */
@Service
public class RecordingService {

    @Autowired
    private RecordingRepository recordingRepository;

    @Autowired
    private SegmentRepository segmentRepository;

    @Autowired
    private MinioClient minioClient;

    @Autowired
    private MinioConfig minioConfig;

    /**
     * Upload recording file and save metadata
     */
    @Transactional
    public Recording uploadRecording(MultipartFile file, Long companyId, Long ownerId,
                                      Long customerId, Long opportunityId, String callType,
                                      Integer duration) {
        try {
            // Generate file path in MinIO
            String objectName = "recordings/" + companyId + "/" + UUID.randomUUID() + "_" + file.getOriginalFilename();

            // Upload to MinIO
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(minioConfig.getBucket())
                            .object(objectName)
                            .stream(file.getInputStream(), file.getSize(), -1)
                            .contentType(file.getContentType())
                            .build()
            );

            // Save recording metadata
            Recording recording = new Recording();
            recording.setCompanyId(companyId);
            recording.setOwnerId(ownerId);
            recording.setCustomerId(customerId);
            recording.setOpportunityId(opportunityId);
            recording.setFileName(file.getOriginalFilename());
            recording.setFilePath(objectName);
            recording.setFileSize(file.getSize());
            recording.setDuration(duration != null ? duration : 0);
            recording.setCallType(callType != null ? callType : "phone");
            recording.setTranscribeStatus("pending");
            recording.setAnalyzeStatus("pending");

            return recordingRepository.save(recording);
        } catch (Exception e) {
            throw new BusinessException("Failed to upload recording: " + e.getMessage());
        }
    }

    public Page<Recording> listRecordings(Long companyId, Pageable pageable) {
        return recordingRepository.findByCompanyIdAndIsDeleted(companyId, 0, pageable);
    }

    public Recording findById(Long id) {
        return recordingRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Recording not found: " + id));
    }

    /**
     * Get transcript segments for a recording
     */
    public List<Segment> getTranscript(Long recordingId) {
        return segmentRepository.findByRecordingIdOrderBySeqAsc(recordingId);
    }

    @Transactional
    public void saveTranscript(Long recordingId, String fullText, List<Segment> segments) {
        Recording recording = findById(recordingId);
        recording.setTranscribeText(fullText);
        recording.setTranscribeStatus("completed");
        recording.setTranscribeAt(LocalDateTime.now());
        recordingRepository.save(recording);

        // Save segments
        segmentRepository.deleteByRecordingId(recordingId);
        segmentRepository.saveAll(segments);
    }

    @Transactional
    public void deleteRecording(Long id) {
        Recording recording = findById(id);
        try {
            minioClient.removeObject(
                    RemoveObjectArgs.builder()
                            .bucket(minioConfig.getBucket())
                            .object(recording.getFilePath())
                            .build()
            );
        } catch (Exception e) {
            // Log but don't fail if file not found in MinIO
        }
        recording.setIsDeleted(1);
        recordingRepository.save(recording);
    }
}
