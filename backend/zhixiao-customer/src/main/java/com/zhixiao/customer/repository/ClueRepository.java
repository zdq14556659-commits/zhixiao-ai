package com.zhixiao.customer.repository;

import com.zhixiao.customer.entity.Clue;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Clue repository
 */
@Repository
public interface ClueRepository extends JpaRepository<Clue, Long> {

    Page<Clue> findByCompanyIdAndIsDeleted(Long companyId, Integer isDeleted, Pageable pageable);

    List<Clue> findByCompanyIdAndIsDeleted(Long companyId, Integer isDeleted);

    long countByCompanyIdAndIsDeleted(Long companyId, Integer isDeleted);

    long countByCompanyIdAndIsDeletedAndStatus(Long companyId, Integer isDeleted, String status);
}
