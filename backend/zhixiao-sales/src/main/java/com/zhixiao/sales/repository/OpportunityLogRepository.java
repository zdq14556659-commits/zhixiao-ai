package com.zhixiao.sales.repository;

import com.zhixiao.sales.entity.OpportunityLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Opportunity log repository
 */
@Repository
public interface OpportunityLogRepository extends JpaRepository<OpportunityLog, Long> {

    List<OpportunityLog> findByOpportunityIdOrderByCreatedAtDesc(Long opportunityId);
}
