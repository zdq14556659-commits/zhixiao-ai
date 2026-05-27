package com.zhixiao.customer.repository;

import com.zhixiao.customer.entity.Customer;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Customer repository
 */
@Repository
public interface CustomerRepository extends JpaRepository<Customer, Long> {

    Page<Customer> findByCompanyIdAndIsDeleted(Long companyId, Integer isDeleted, Pageable pageable);

    List<Customer> findByOwnerIdAndIsDeleted(Long ownerId, Integer isDeleted);

    List<Customer> findByCompanyIdAndIsDeleted(Long companyId, Integer isDeleted);

    long countByCompanyIdAndIsDeleted(Long companyId, Integer isDeleted);

    long countByCompanyIdAndIsDeletedAndStage(Long companyId, Integer isDeleted, String stage);
}
