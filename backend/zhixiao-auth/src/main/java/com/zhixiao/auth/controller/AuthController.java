package com.zhixiao.auth.controller;

import com.zhixiao.auth.dto.LoginRequest;
import com.zhixiao.auth.dto.LoginResponse;
import com.zhixiao.auth.dto.RegisterRequest;
import com.zhixiao.common.exception.BusinessException;
import com.zhixiao.common.response.Result;
import com.zhixiao.common.util.JwtUtil;
import com.zhixiao.user.entity.User;
import com.zhixiao.user.service.UserService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

/**
 * Authentication controller
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private UserService userService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @PostMapping("/login")
    public Result<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        User user = userService.findByUsername(request.getUsername())
                .orElseThrow(() -> new BusinessException("Invalid username or password"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new BusinessException("Invalid username or password");
        }

        if (user.getStatus() == 0) {
            throw new BusinessException("Account is disabled");
        }

        // Update last login time
        userService.updateLastLogin(user.getId());

        // Generate JWT token
        String token = JwtUtil.generateToken(user.getId(), user.getUsername());

        LoginResponse response = LoginResponse.builder()
                .token(token)
                .userId(user.getId())
                .username(user.getUsername())
                .realName(user.getRealName())
                .avatar(user.getAvatar())
                .email(user.getEmail())
                .role("USER")
                .build();

        return Result.success(response);
    }

    @PostMapping("/register")
    public Result<LoginResponse> register(@Valid @RequestBody RegisterRequest request) {
        // Check if username already exists
        if (userService.findByUsername(request.getUsername()).isPresent()) {
            throw new BusinessException("Username already exists");
        }

        // Create user
        User user = new User();
        user.setCompanyId(1L); // Default company
        user.setUsername(request.getUsername());
        user.setPassword(request.getPassword());
        user.setRealName(request.getRealName());
        user.setPhone(request.getPhone());
        user.setEmail(request.getEmail());

        user = userService.createUser(user);

        // Generate JWT token
        String token = JwtUtil.generateToken(user.getId(), user.getUsername());

        LoginResponse response = LoginResponse.builder()
                .token(token)
                .userId(user.getId())
                .username(user.getUsername())
                .realName(user.getRealName())
                .avatar(user.getAvatar())
                .email(user.getEmail())
                .role("USER")
                .build();

        return Result.created(response);
    }
}
