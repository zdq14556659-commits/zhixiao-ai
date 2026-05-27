package com.zhixiao.customer.repository;

import com.zhixiao.customer.entity.Communication;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Communication repository
 */
@Repository
public interface CommunicationRepository extends JpaRepository<Communication, Long> {

    List<Communication> findByCustomerIdOrderByCreatedAtDesc(Long customerId);
}
