package com.zhixiao.recording.repository;

import com.zhixiao.recording.entity.Recording;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Recording repository
 */
@Repository
public interface RecordingRepository extends JpaRepository<Recording, Long> {

    Page<Recording> findByCompanyIdAndIsDeleted(Long companyId, Integer isDeleted, Pageable pageable);

    List<Recording> findByCustomerIdAndIsDeleted(Long customerId, Integer isDeleted);
}
