package com.zhixiao.recording.repository;

import com.zhixiao.recording.entity.Segment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Segment repository
 */
@Repository
public interface SegmentRepository extends JpaRepository<Segment, Long> {

    List<Segment> findByRecordingIdOrderBySeqAsc(Long recordingId);

    void deleteByRecordingId(Long recordingId);
}
