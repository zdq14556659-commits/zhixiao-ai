package com.zhixiao.customer.repository;

import com.zhixiao.customer.entity.Contact;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Contact repository
 */
@Repository
public interface ContactRepository extends JpaRepository<Contact, Long> {

    List<Contact> findByCustomerIdAndIsDeleted(Long customerId, Integer isDeleted);
}
