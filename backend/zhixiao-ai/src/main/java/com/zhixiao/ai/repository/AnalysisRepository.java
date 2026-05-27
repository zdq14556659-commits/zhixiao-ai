package com.zhixiao.ai.repository;

import com.zhixiao.ai.entity.Analysis;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Analysis repository
 */
@Repository
public interface AnalysisRepository extends JpaRepository<Analysis, Long> {

    Optional<Analysis> findByRecordingId(Long recordingId);
}
