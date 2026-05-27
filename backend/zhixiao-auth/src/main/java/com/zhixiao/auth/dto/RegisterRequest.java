package com.zhixiao.auth.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Register request DTO
 */
@Data
public class RegisterRequest {

    @NotBlank(message = "username cannot be empty")
    private String username;

    @NotBlank(message = "password cannot be empty")
    private String password;

    private String realName;

    private String phone;

    private String email;
}
