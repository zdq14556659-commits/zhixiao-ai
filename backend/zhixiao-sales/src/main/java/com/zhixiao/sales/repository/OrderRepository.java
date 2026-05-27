package com.zhixiao.sales.repository;

import com.zhixiao.sales.entity.Order;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Order repository
 */
@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {

    Page<Order> findByCompanyIdAndIsDeleted(Long companyId, Integer isDeleted, Pageable pageable);

    List<Order> findByCustomerIdAndIsDeleted(Long customerId, Integer isDeleted);

    long countByCompanyIdAndIsDeleted(Long companyId, Integer isDeleted);
}
