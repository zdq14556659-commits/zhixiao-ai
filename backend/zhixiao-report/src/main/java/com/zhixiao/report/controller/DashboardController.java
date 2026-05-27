package com.zhixiao.report.controller;

import com.zhixiao.common.response.Result;
import com.zhixiao.report.dto.DashboardSummaryVO;
import com.zhixiao.report.dto.FunnelDataVO;
import com.zhixiao.report.service.DashboardService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Dashboard controller
 */
@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    @Autowired
    private DashboardService dashboardService;

    /**
     * Get dashboard summary
     */
    @GetMapping("/summary")
    public Result<DashboardSummaryVO> getSummary() {
        return Result.success(dashboardService.getSummary(1L));
    }

    /**
     * Get sales funnel data
     */
    @GetMapping("/funnel")
    public Result<FunnelDataVO> getFunnel() {
        return Result.success(dashboardService.getFunnelData(1L));
    }
}
