package com.zhixiao.sales.controller;

import com.zhixiao.common.response.PageResult;
import com.zhixiao.common.response.Result;
import com.zhixiao.sales.entity.Opportunity;
import com.zhixiao.sales.entity.OpportunityLog;
import com.zhixiao.sales.service.SalesService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Opportunity controller
 */
@RestController
@RequestMapping("/api/opportunities")
public class OpportunityController {

    @Autowired
    private SalesService salesService;

    @GetMapping
    public PageResult<Opportunity> listOpportunities(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int pageSize) {
        Page<Opportunity> oppPage = salesService.listOpportunities(1L, PageRequest.of(page - 1, pageSize));
        return PageResult.success(oppPage.getContent(), oppPage.getTotalElements(), page, pageSize);
    }

    @GetMapping("/{id}")
    public Result<Opportunity> getOpportunity(@PathVariable Long id) {
        return Result.success(salesService.findOpportunityById(id));
    }

    @PostMapping
    public Result<Opportunity> createOpportunity(@RequestBody Opportunity opportunity) {
        return Result.created(salesService.createOpportunity(opportunity));
    }

    @PutMapping("/{id}")
    public Result<Opportunity> updateOpportunity(@PathVariable Long id, @RequestBody Opportunity opportunity) {
        return Result.success(salesService.updateOpportunity(id, opportunity));
    }

    @DeleteMapping("/{id}")
    public Result<Void> deleteOpportunity(@PathVariable Long id) {
        salesService.deleteOpportunity(id);
        return Result.success();
    }

    /**
     * Change opportunity stage
     */
    @PutMapping("/{id}/stage")
    public Result<Opportunity> changeStage(
            @PathVariable Long id,
            @RequestBody Map<String, String> body,
            @RequestAttribute("userId") Long userId) {
        String newStage = body.get("stage");
        String remark = body.get("remark");
        return Result.success(salesService.changeStage(id, newStage, remark, userId));
    }

    /**
     * Get stage change history
     */
    @GetMapping("/{id}/logs")
    public Result<List<OpportunityLog>> getStageHistory(@PathVariable Long id) {
        return Result.success(salesService.getStageHistory(id));
    }
}
