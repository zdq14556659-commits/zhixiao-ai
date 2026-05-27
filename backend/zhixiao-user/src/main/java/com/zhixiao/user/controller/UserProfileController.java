package com.zhixiao.user.controller;

import com.zhixiao.common.response.Result;
import com.zhixiao.user.entity.User;
import com.zhixiao.user.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

/**
 * User profile controller - separate base path
 */
@RestController
@RequestMapping("/api/user")
public class UserProfileController {

    @Autowired
    private UserService userService;

    @GetMapping("/profile")
    public Result<User> getProfile(@RequestAttribute("userId") Long userId) {
        return Result.success(userService.findById(userId));
    }

    @PutMapping("/profile")
    public Result<User> updateProfile(@RequestAttribute("userId") Long userId, @RequestBody User user) {
        return Result.success(userService.updateUser(userId, user));
    }
}
