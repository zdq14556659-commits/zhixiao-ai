package com.zhixiao.customer.controller;

import com.zhixiao.common.response.PageResult;
import com.zhixiao.common.response.Result;
import com.zhixiao.customer.entity.Clue;
import com.zhixiao.customer.service.CustomerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

/**
 * Clue controller
 */
@RestController
@RequestMapping("/api/clues")
public class ClueController {

    @Autowired
    private CustomerService customerService;

    @GetMapping
    public PageResult<Clue> listClues(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int pageSize) {
        Page<Clue> cluePage = customerService.listCluesByCompany(1L, PageRequest.of(page - 1, pageSize));
        return PageResult.success(cluePage.getContent(), cluePage.getTotalElements(), page, pageSize);
    }

    @GetMapping("/{id}")
    public Result<Clue> getClue(@PathVariable Long id) {
        return Result.success(customerService.findClueById(id));
    }

    @PostMapping
    public Result<Clue> createClue(@RequestBody Clue clue) {
        return Result.created(customerService.createClue(clue));
    }

    @PutMapping("/{id}")
    public Result<Clue> updateClue(@PathVariable Long id, @RequestBody Clue clue) {
        return Result.success(customerService.updateClue(id, clue));
    }

    @DeleteMapping("/{id}")
    public Result<Void> deleteClue(@PathVariable Long id) {
        customerService.deleteClue(id);
        return Result.success();
    }
}
