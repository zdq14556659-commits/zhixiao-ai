package com.zhixiao.user.repository;

import com.zhixiao.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * User repository
 */
@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsernameAndIsDeleted(String username, Integer isDeleted);

    Optional<User> findByUsernameAndCompanyIdAndIsDeleted(String username, Long companyId, Integer isDeleted);

    boolean existsByUsernameAndIsDeleted(String username, Integer isDeleted);
}
