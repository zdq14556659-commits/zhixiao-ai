package com.zhixiao.user.service;

import com.zhixiao.common.exception.BusinessException;
import com.zhixiao.user.entity.User;
import com.zhixiao.user.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

/**
 * User service
 */
@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    public Optional<User> findByUsername(String username) {
        return userRepository.findByUsernameAndIsDeleted(username, 0);
    }

    public User findById(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new BusinessException("User not found with id: " + id));
    }

    public Page<User> listUsers(Pageable pageable) {
        return userRepository.findAll(pageable);
    }

    @Transactional
    public User createUser(User user) {
        if (userRepository.existsByUsernameAndIsDeleted(user.getUsername(), 0)) {
            throw new BusinessException("Username already exists: " + user.getUsername());
        }
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        return userRepository.save(user);
    }

    @Transactional
    public User updateUser(Long id, User updated) {
        User user = findById(id);
        if (updated.getRealName() != null) user.setRealName(updated.getRealName());
        if (updated.getPhone() != null) user.setPhone(updated.getPhone());
        if (updated.getEmail() != null) user.setEmail(updated.getEmail());
        if (updated.getAvatar() != null) user.setAvatar(updated.getAvatar());
        if (updated.getJobTitle() != null) user.setJobTitle(updated.getJobTitle());
        if (updated.getDepartment() != null) user.setDepartment(updated.getDepartment());
        if (updated.getStatus() != null) user.setStatus(updated.getStatus());
        return userRepository.save(user);
    }

    @Transactional
    public void deleteUser(Long id) {
        User user = findById(id);
        user.setIsDeleted(1);
        userRepository.save(user);
    }

    @Transactional
    public void updateLastLogin(Long id) {
        userRepository.findById(id).ifPresent(user -> {
            user.setLastLoginAt(LocalDateTime.now());
            userRepository.save(user);
        });
    }
}
