package com.zhixiao.user.controller;

import com.zhixiao.common.response.PageResult;
import com.zhixiao.common.response.Result;
import com.zhixiao.user.entity.User;
import com.zhixiao.user.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * User controller
 */
@RestController
@RequestMapping("/api/users")
public class UserController {

    @Autowired
    private UserService userService;

    @GetMapping
    public PageResult<User> listUsers(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int pageSize) {
        Page<User> userPage = userService.listUsers(PageRequest.of(page - 1, pageSize));
        return PageResult.success(userPage.getContent(), userPage.getTotalElements(), page, pageSize);
    }

    @GetMapping("/{id}")
    public Result<User> getUser(@PathVariable Long id) {
        return Result.success(userService.findById(id));
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public Result<User> createUser(@RequestBody User user) {
        return Result.created(userService.createUser(user));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public Result<User> updateUser(@PathVariable Long id, @RequestBody User user) {
        return Result.success(userService.updateUser(id, user));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public Result<Void> deleteUser(@PathVariable Long id) {
        userService.deleteUser(id);
        return Result.success();
    }

    @GetMapping("/profile")
    public Result<User> getProfile(@RequestAttribute("userId") Long userId) {
        return Result.success(userService.findById(userId));
    }
}
