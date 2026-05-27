package com.zhixiao.sales.repository;

import com.zhixiao.sales.entity.Opportunity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Opportunity repository
 */
@Repository
public interface OpportunityRepository extends JpaRepository<Opportunity, Long> {

    Page<Opportunity> findByCompanyIdAndIsDeleted(Long companyId, Integer isDeleted, Pageable pageable);

    List<Opportunity> findByCustomerIdAndIsDeleted(Long customerId, Integer isDeleted);

    long countByCompanyIdAndIsDeleted(Long companyId, Integer isDeleted);

    long countByCompanyIdAndIsDeletedAndStage(Long companyId, Integer isDeleted, String stage);
}
